'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/noyau/prisma'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantApprenant, IdentifiantEvaluation } from '@/noyau/identifiants'
import { depotEvaluationPrisma, soumettre } from '@/domaines/evaluation'
import { depotProgressionPrisma, enregistrerResultat } from '@/domaines/progression'
import { peut } from '@/domaines/identite'
import { sessionCourante } from '../../_session'
import { auditer } from '../../_audit'

export type EtatCopie = {
  readonly score?: number
  readonly scoreMax?: number
  readonly attendUnHumain?: boolean
  /** Compétences dont le niveau a réellement bougé. */
  readonly montees?: readonly string[]
  /** Par question : la part obtenue et le pourquoi. Absent avant la remise. */
  readonly parQuestion?: readonly {
    questionId: string
    score: number | null
    bareme: number
    explication: string | null
  }[]
  readonly erreur?: string
}

const Entree = z.object({
  evaluationId: z.string().uuid(),
  copie: z.string(),
})

export async function rendreCopie(
  _precedent: EtatCopie,
  donnees: FormData,
): Promise<EtatCopie> {
  // 1. Authentifier
  const session = await sessionCourante()
  if (session.sujetId === null) return { erreur: 'Session expirée. Reconnecte-toi.' }

  // 2. Valider
  const entree = Entree.safeParse({
    evaluationId: donnees.get('evaluationId'),
    copie: donnees.get('copie'),
  })
  if (!entree.success) return { erreur: 'Copie illisible. Recharge la page.' }

  let reponses: Record<string, unknown>
  try {
    const analyse: unknown = JSON.parse(entree.data.copie)
    reponses = typeof analyse === 'object' && analyse !== null ? (analyse as Record<string, unknown>) : {}
  } catch {
    return { erreur: 'Copie illisible. Recharge la page.' }
  }

  // 3. Autoriser
  const apprenantId = session.sujetId as IdentifiantApprenant
  if (!peut(session, 'evaluation.passer', { apprenantId }).autorise) {
    return { erreur: 'Cette évaluation ne t’est pas destinée.' }
  }
  if (!session.etablissementId) return { erreur: 'Compte sans établissement.' }

  // 4. Exécuter
  const evaluationId = identifiant<IdentifiantEvaluation>(entree.data.evaluationId)
  const resultat = await soumettre(
    evaluationId,
    apprenantId,
    { reponses },
    depotEvaluationPrisma(prisma),
  )

  if (!resultat.ok) return { erreur: resultat.erreur.message }

  // La progression est un module distinct : l'évaluation ne sait pas ce qu'est
  // une compétence acquise, elle sait seulement ce que vaut une copie.
  const evolutions = await enregistrerResultat(
    {
      apprenantId,
      etablissementId: session.etablissementId,
      competences: resultat.valeur.competences,
      score: resultat.valeur.score,
      scoreMax: resultat.valeur.scoreMax,
      sourceId: entree.data.evaluationId,
      survenuLe: new Date(),
    },
    depotProgressionPrisma(prisma),
  )

  // 5. Invalider — le tableau de bord affiche des compteurs qui viennent de
  //    changer.
  revalidatePath('/aujourdhui')

  // 6. Auditer — une note est une donnée sensible : un établissement doit
  //    pouvoir répondre à « d'où vient ce résultat ? ».
  await auditer('copie.rendue', session, {
    type: 'evaluation',
    id: entree.data.evaluationId,
  })

  return {
    score: resultat.valeur.score,
    scoreMax: resultat.valeur.scoreMax,
    attendUnHumain: resultat.valeur.attendUnHumain,
    montees: evolutions.filter((e) => e.modifie).map((e) => e.competenceId),
    parQuestion: resultat.valeur.parQuestion,
  }
}
