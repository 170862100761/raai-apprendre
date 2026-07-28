'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/noyau/prisma'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantClasse } from '@/noyau/identifiants'
import { genererCode, hachageBcrypt, peut } from '@/domaines/identite'
import {
  creerClasse,
  depotOrganisationPrisma,
  inscrireEleves,
  type AccesEleve,
  type LigneRejetee,
} from '@/domaines/organisation'
import { sessionCourante } from '../_session'
import { auditer } from '../_audit'

export type EtatClasse = {
  readonly classeId?: string
  readonly nom?: string
  readonly codeRattachement?: string
  readonly erreur?: string
  readonly champs?: Readonly<Record<string, string>>
}

const Classe = z.object({
  offreId: z.string().uuid('Choisis une formation.'),
  niveauId: z.string().uuid('Choisis un niveau.'),
  anneeId: z.string().uuid('Choisis une année scolaire.'),
  nom: z.string().min(2, 'Au moins deux caractères.'),
  annee: z.string().min(4),
})

export async function creer(
  _precedent: EtatClasse,
  donnees: FormData,
): Promise<EtatClasse> {
  const session = await sessionCourante()
  if (session.sujetId === null) return { erreur: 'Session expirée.' }

  const entree = Classe.safeParse(Object.fromEntries(donnees))
  if (!entree.success) {
    const champs: Record<string, string> = {}
    for (const probleme of entree.error.issues) {
      const champ = probleme.path[0]
      if (typeof champ === 'string' && !champs[champ]) champs[champ] = probleme.message
    }
    return { erreur: 'Vérifie ta saisie.', champs }
  }

  const decision = peut(session, 'classe.creer')
  if (!decision.autorise) return { erreur: decision.motif }
  if (!session.etablissementId) return { erreur: 'Compte sans établissement.' }

  const resultat = await creerClasse(
    { ...entree.data, etablissementId: session.etablissementId },
    { depot: depotOrganisationPrisma(prisma) },
  )

  if (!resultat.ok) {
    return {
      erreur: resultat.erreur.message,
      ...(resultat.erreur.champs ? { champs: resultat.erreur.champs } : {}),
    }
  }

  revalidatePath('/administration')
  await auditer('classe.creee', session, { type: 'classe', id: resultat.valeur.id })

  return {
    classeId: resultat.valeur.id,
    nom: resultat.valeur.nom,
    codeRattachement: resultat.valeur.codeRattachement,
  }
}

export type EtatImport = {
  readonly acces?: readonly AccesEleve[]
  readonly rejetes?: readonly LigneRejetee[]
  readonly colonnesIgnorees?: number
  readonly erreur?: string
}

const Import = z.object({
  classeId: z.string().uuid(),
  liste: z.string().min(1).max(50_000),
})

/**
 * Inscrit une liste d'élèves.
 *
 * Le retour contient les codes en clair — la seule et unique fois où ils
 * existent en dehors d'un condensat bcrypt. Ils ne sont ni journalisés, ni
 * mis en cache, ni renvoyés une seconde fois.
 */
export async function importer(
  _precedent: EtatImport,
  donnees: FormData,
): Promise<EtatImport> {
  const session = await sessionCourante()
  if (session.sujetId === null) return { erreur: 'Session expirée.' }

  const entree = Import.safeParse({
    classeId: donnees.get('classeId'),
    liste: donnees.get('liste'),
  })
  if (!entree.success) return { erreur: 'Colle une liste d’élèves.' }

  const decision = peut(session, 'apprenant.creer')
  if (!decision.autorise) return { erreur: decision.motif }
  if (!session.etablissementId) return { erreur: 'Compte sans établissement.' }

  const resultat = await inscrireEleves(
    identifiant<IdentifiantClasse>(entree.data.classeId),
    session.etablissementId,
    entree.data.liste,
    {
      depot: depotOrganisationPrisma(prisma),
      hachage: hachageBcrypt,
      genererCode,
    },
  )

  if (!resultat.ok) return { erreur: resultat.erreur.message }

  revalidatePath('/administration')
  revalidatePath('/formateur')

  // Deux traces distinctes : créer un compte d'élève et lui remettre son code
  // sont deux actes différents, et le second est celui qui expose un secret.
  await auditer('apprenant.cree', session, { type: 'classe', id: entree.data.classeId })
  await auditer('apprenant.acces_remis', session, {
    type: 'classe',
    id: entree.data.classeId,
  })

  return {
    acces: resultat.valeur.acces,
    rejetes: resultat.valeur.rejetes,
    colonnesIgnorees: resultat.valeur.colonnesIgnorees,
  }
}
