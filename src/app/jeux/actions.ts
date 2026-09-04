'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/noyau/prisma'
import type { IdentifiantApprenant } from '@/noyau/identifiants'
import { peut } from '@/domaines/identite'
import { depotProgressionPrisma } from '@/domaines/progression'
import { depotScoresPrisma, enregistrerScoreJeu as enregistrerPartie } from '@/domaines/jeux'
import { sessionCourante } from '../_session'
import { auditer } from '../_audit'
import { listerJeux } from './_contenu'

export type EtatScoreJeu = {
  readonly enregistre: boolean
  /** Combien de compétences ont bougé grâce à cette partie. */
  readonly competencesTouchees?: number
  readonly erreur?: string
}

const Entree = z.object({
  jeu: z.string().regex(/^[a-z0-9-]+$/),
  score: z.number().int().min(0).max(100_000),
  scoreMax: z.number().int().min(1).max(100_000),
})

/**
 * Garde en base la partie qu'un élève vient de terminer.
 *
 * Le navigateur garde son propre meilleur score de toute façon : cette action
 * peut échouer sans que l'élève perde quoi que ce soit à l'écran. C'est ce
 * qui rend le module `jeux` supprimable.
 */
export async function enregistrerScoreJeu(entreeBrute: {
  jeu: string
  score: number
  scoreMax: number
}): Promise<EtatScoreJeu> {
  // 1. Authentifier — seul un élève a un score à garder : un adulte qui
  //    essaie un jeu ne nourrit la progression de personne.
  const session = await sessionCourante()
  if (session.sujetId === null) return { enregistre: false, erreur: 'Session expirée.' }
  if (session.origine !== 'jeton_apprenant') {
    return { enregistre: false, erreur: 'Score non enregistré : tu n’es pas connecté comme élève.' }
  }

  // 2. Valider
  const entree = Entree.safeParse(entreeBrute)
  if (!entree.success) return { enregistre: false, erreur: 'Score illisible.' }

  const jeu = listerJeux().find((j) => j.cle === entree.data.jeu)
  if (!jeu) return { enregistre: false, erreur: 'Jeu inconnu.' }

  // 3. Autoriser
  const apprenantId = session.sujetId as IdentifiantApprenant
  const decision = peut(session, 'progression.lire_la_sienne', { apprenantId })
  if (!decision.autorise) return { enregistre: false, erreur: decision.motif }
  if (!session.etablissementId) return { enregistre: false, erreur: 'Élève sans établissement.' }

  // 4. Exécuter
  const resultat = await enregistrerPartie(
    {
      apprenantId,
      etablissementId: session.etablissementId,
      jeu: jeu.cle,
      capacites: jeu.capacites,
      score: entree.data.score,
      scoreMax: entree.data.scoreMax,
      joueLe: new Date(),
    },
    { scores: depotScoresPrisma(prisma), progression: depotProgressionPrisma(prisma) },
  )
  if (!resultat.ok) return { enregistre: false, erreur: resultat.erreur.message }

  // 5. Invalider
  revalidatePath('/aujourdhui')
  revalidatePath('/jeux')

  // 6. Auditer — la ligne de score, jamais sa valeur. Le journal n'accepte
  //    qu'un UUID comme identifiant de cible : la clé du jeu n'y entrerait pas,
  //    et l'écriture échouerait en silence.
  await auditer('jeu.score', session, { type: 'score_jeu', id: resultat.valeur.id })

  return {
    enregistre: true,
    competencesTouchees: resultat.valeur.evolutions.filter((e) => e.modifie).length,
  }
}
