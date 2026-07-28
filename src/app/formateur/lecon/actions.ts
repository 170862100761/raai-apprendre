'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/noyau/prisma'
import { identifiant, type IdentifiantCompetence, type IdentifiantLecon } from '@/noyau/identifiants'
import {
  creerLecon,
  depotCataloguePrisma,
  enregistrerLecon,
  publierLecon,
} from '@/domaines/catalogue'
import { peut } from '@/domaines/identite'
import { sessionCourante } from '../../_session'
import { auditer } from '../../_audit'

export type EtatEdition = {
  readonly message?: string
  readonly erreur?: string
  readonly alertes?: readonly string[]
  readonly champs?: Readonly<Record<string, string>>
}

const depot = () => depotCataloguePrisma(prisma)

/** Les six étapes du document 06, dans l'ordre. */
async function encadrer<T>(
  action: string,
  travail: (etablissementId: string) => Promise<T>,
): Promise<T | EtatEdition> {
  const session = await sessionCourante() // 1. authentifier
  if (session.sujetId === null) return { erreur: 'Session expirée. Reconnecte-toi.' }

  // 3. autoriser (la validation est propre à chaque action, en amont)
  if (!peut(session, action === 'publier' ? 'lecon.publier' : 'lecon.ecrire').autorise) {
    return { erreur: 'Tu n’as pas les droits pour modifier une leçon.' }
  }
  if (!session.etablissementId) return { erreur: 'Compte sans établissement.' }

  return travail(session.etablissementId)
}

const Creation = z.object({
  chapitreId: z.string().uuid('Choisis un chapitre.'),
  titre: z.string().min(3, 'Au moins trois caractères.'),
  competences: z.array(z.string().uuid()).min(1, 'Choisis au moins une compétence.'),
})

export async function creer(
  _precedent: EtatEdition,
  donnees: FormData,
): Promise<EtatEdition> {
  const entree = Creation.safeParse({
    chapitreId: donnees.get('chapitreId'),
    titre: donnees.get('titre'),
    competences: donnees.getAll('competences'),
  })

  if (!entree.success) {
    const champs: Record<string, string> = {}
    for (const probleme of entree.error.issues) {
      const champ = probleme.path[0]
      if (typeof champ === 'string' && !champs[champ]) champs[champ] = probleme.message
    }
    return { erreur: 'Vérifie ta saisie.', champs }
  }

  let destination: string | null = null

  const resultat = await encadrer('ecrire', async (etablissementId) => {
    const cree = await creerLecon(
      {
        chapitreId: entree.data.chapitreId,
        etablissementId,
        titre: entree.data.titre,
        competences: entree.data.competences.map((c) =>
          identifiant<IdentifiantCompetence>(c),
        ),
      },
      depot(),
    )

    if (!cree.ok) {
      return {
        erreur: cree.erreur.message,
        ...(cree.erreur.champs ? { champs: cree.erreur.champs } : {}),
      }
    }

    destination = `/formateur/lecon/${cree.valeur.leconId}`
    return {}
  })

  if (destination) {
    revalidatePath('/formateur')
    redirect(destination)
  }
  return resultat as EtatEdition
}

const Enregistrement = z.object({
  leconId: z.string().uuid(),
  titre: z.string().min(3),
  competences: z.array(z.string().uuid()),
  blocs: z.string(),
})

export async function enregistrer(
  _precedent: EtatEdition,
  donnees: FormData,
): Promise<EtatEdition> {
  const entree = Enregistrement.safeParse({
    leconId: donnees.get('leconId'),
    titre: donnees.get('titre'),
    competences: donnees.getAll('competences'),
    blocs: donnees.get('blocs'),
  })
  if (!entree.success) return { erreur: 'Vérifie ta saisie.' }

  let blocsBruts: unknown[]
  try {
    const analyse: unknown = JSON.parse(entree.data.blocs)
    blocsBruts = Array.isArray(analyse) ? analyse : []
  } catch {
    return { erreur: 'Contenu illisible. Recharge la page.' }
  }

  return (await encadrer('ecrire', async () => {
    const resultat = await enregistrerLecon(
      {
        leconId: identifiant<IdentifiantLecon>(entree.data.leconId),
        titre: entree.data.titre,
        competences: entree.data.competences.map((c) =>
          identifiant<IdentifiantCompetence>(c),
        ),
        blocs: blocsBruts,
      },
      depot(),
    )

    if (!resultat.ok) return { erreur: resultat.erreur.message }

    revalidatePath('/formateur')
    revalidatePath(`/cours/${entree.data.leconId}`)

    // Les blocs refusés ne sont pas tus : un enseignant qui perd un contenu
    // sans être prévenu ne revient pas.
    return resultat.valeur.blocsRefuses > 0
      ? {
          message: 'Enregistré.',
          alertes: [
            `${resultat.valeur.blocsRefuses} contenu(s) incomplet(s) n’ont pas été enregistrés.`,
          ],
        }
      : { message: 'Enregistré.' }
  })) as EtatEdition
}

export async function publier(
  _precedent: EtatEdition,
  donnees: FormData,
): Promise<EtatEdition> {
  const leconId = z.string().uuid().safeParse(donnees.get('leconId'))
  if (!leconId.success) return { erreur: 'Leçon inconnue.' }

  const session = await sessionCourante()

  return (await encadrer('publier', async () => {
    const resultat = await publierLecon(
      identifiant<IdentifiantLecon>(leconId.data),
      depot(),
    )

    if (!resultat.ok) return { erreur: resultat.erreur.message }

    revalidatePath('/formateur')
    revalidatePath('/aujourdhui')
    revalidatePath(`/cours/${leconId.data}`)

    // Publier, c'est envoyer un contenu à des mineurs : on garde qui l'a fait.
    await auditer('lecon.publiee', session, { type: 'lecon', id: leconId.data })

    return {
      message: `Publiée — ${resultat.valeur.dureeEstimeeMin} min de lecture estimées.`,
      ...(resultat.valeur.alertes.length > 0 ? { alertes: resultat.valeur.alertes } : {}),
    }
  })) as EtatEdition
}
