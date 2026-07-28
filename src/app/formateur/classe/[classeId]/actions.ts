'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/noyau/prisma'
import { identifiant } from '@/noyau/identifiants'
import type {
  IdentifiantApprenant,
  IdentifiantClasse,
  IdentifiantCompetence,
} from '@/noyau/identifiants'
import { declarer, depotProgressionPrisma } from '@/domaines/progression'
import { peut } from '@/domaines/identite'
import { sessionCourante } from '../../../_session'

export type EtatDeclaration = { readonly message?: string; readonly erreur?: string }

const Entree = z.object({
  classeId: z.string().uuid(),
  apprenantId: z.string().uuid(),
  competenceId: z.string().uuid(),
  niveau: z.enum(['non_abordee', 'en_cours', 'acquise', 'maitrisee']),
})

/**
 * Déclaration d'un acquis par l'enseignant.
 *
 * C'est la **seule** voie par laquelle un acquis peut descendre. Un enseignant
 * qui constate qu'un élève ne sait plus faire doit pouvoir le dire ; une
 * évaluation ratée, elle, ne défait rien.
 */
export async function declarerAcquis(
  _precedent: EtatDeclaration,
  donnees: FormData,
): Promise<EtatDeclaration> {
  // 1. Authentifier
  const session = await sessionCourante()
  if (session.sujetId === null) return { erreur: 'Session expirée.' }

  // 2. Valider
  const entree = Entree.safeParse({
    classeId: donnees.get('classeId'),
    apprenantId: donnees.get('apprenantId'),
    competenceId: donnees.get('competenceId'),
    niveau: donnees.get('niveau'),
  })
  if (!entree.success) return { erreur: 'Saisie invalide.' }

  // 3. Autoriser — « déclarer une compétence » est réservé à l'enseignant de
  //    la classe : ni le responsable pédagogique ni l'administration ne
  //    notent à sa place.
  const classeId = identifiant<IdentifiantClasse>(entree.data.classeId)
  const decision = peut(session, 'competence.declarer', { classeId })
  if (!decision.autorise) return { erreur: decision.motif }
  if (!session.etablissementId) return { erreur: 'Compte sans établissement.' }

  // 4. Exécuter
  const depot = depotProgressionPrisma(prisma)
  const apprenantId = identifiant<IdentifiantApprenant>(entree.data.apprenantId)
  const competenceId = identifiant<IdentifiantCompetence>(entree.data.competenceId)

  const existants = await depot.lireAcquis(apprenantId, [competenceId])
  const evolution = declarer(competenceId, entree.data.niveau, existants.get(competenceId) ?? null)

  if (!evolution.modifie) return { message: 'Aucun changement.' }

  await depot.ecrireAcquis([
    {
      apprenantId,
      competenceId,
      etablissementId: session.etablissementId,
      niveau: evolution.niveau,
      score: evolution.score,
      origine: evolution.origine,
      sourceId: null,
      constateLe: new Date(),
    },
  ])

  // 5. Invalider — la grille et le tableau de bord de l'élève changent.
  revalidatePath(`/formateur/classe/${entree.data.classeId}`)
  revalidatePath('/aujourdhui')

  // 6. Auditer — modifier un acquis est une action sensible. Arrivera avec le
  //    module `audit`.

  return { message: 'Enregistré.' }
}
