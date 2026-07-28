import type {
  IdentifiantApprenant,
  IdentifiantCompetence,
  IdentifiantEvaluation,
} from '@/noyau/identifiants'
import { echec, succes, type Resultat } from '@/noyau/resultat'
import { lireReponse } from '../domaine/question'
import {
  corrigerTentative,
  estModifiable,
  expiree,
  type ReponseDonnee,
} from '../domaine/tentative'
import type { DepotEvaluation, EvaluationPourEleve } from '../ports/depot-evaluation'

export type Copie = {
  /** Ce que l'élève a envoyé, non validé : il vient du réseau. */
  readonly reponses: Readonly<Record<string, unknown>>
}

export type ResultatSoumission = {
  readonly score: number
  readonly scoreMax: number
  readonly attendUnHumain: boolean
  readonly competences: readonly IdentifiantCompetence[]
  /** Détail par question, pour le retour immédiat à l'élève. */
  readonly parQuestion: readonly { questionId: string; score: number | null; bareme: number }[]
}

/**
 * Démarre — ou reprend — une tentative.
 *
 * Reprendre plutôt que recréer : un élève dont le réseau coupe, chose courante
 * en zone rurale, doit retrouver sa tentative et non en ouvrir une seconde.
 */
export async function demarrerOuReprendre(
  evaluationId: IdentifiantEvaluation,
  apprenantId: IdentifiantApprenant,
  depot: DepotEvaluation,
): Promise<Resultat<{ evaluation: EvaluationPourEleve; tentativeId: string }>> {
  const evaluation = await depot.chargerPourEleve(evaluationId)
  if (!evaluation) return echec('introuvable', 'Évaluation introuvable.')

  const existante = await depot.tentativeEnCours(evaluationId, apprenantId)
  const tentative =
    existante ??
    (await depot.demarrerTentative({
      evaluationId,
      apprenantId,
      etablissementId: evaluation.etablissementId,
    }))

  return succes({ evaluation, tentativeId: tentative.id })
}

/**
 * Soumet une copie et la corrige.
 *
 * Les corrigés ne sont chargés qu'ici : ils n'existent nulle part dans le
 * chemin qui a servi l'énoncé.
 */
export async function soumettre(
  evaluationId: IdentifiantEvaluation,
  apprenantId: IdentifiantApprenant,
  copie: Copie,
  depot: DepotEvaluation,
  maintenant: Date = new Date(),
): Promise<Resultat<ResultatSoumission>> {
  const evaluation = await depot.chargerPourEleve(evaluationId)
  if (!evaluation) return echec('introuvable', 'Évaluation introuvable.')

  const tentative = await depot.tentativeEnCours(evaluationId, apprenantId)
  if (!tentative) {
    return echec('conflit', 'Aucune tentative en cours. Recommence l’évaluation.')
  }

  if (!estModifiable(tentative.statut)) {
    // Double soumission : le second clic ne doit ni écraser ni dupliquer.
    return echec('conflit', 'Cette évaluation a déjà été rendue.')
  }

  if (expiree(tentative, evaluation.dureeMaxMin, maintenant)) {
    return echec('regle_metier', 'Le temps imparti est écoulé.')
  }

  // Ce qui vient du réseau est invalide jusqu'à preuve du contraire. Une
  // réponse illisible vaut zéro, elle ne fait pas échouer toute la copie.
  const reponses: ReponseDonnee[] = []
  for (const [questionId, brute] of Object.entries(copie.reponses)) {
    const reponse = lireReponse(brute)
    if (reponse) reponses.push({ questionId, reponse })
  }

  const corriges = await depot.chargerCorriges(evaluationId)
  const resultat = corrigerTentative(
    corriges.map((q) => ({ questionId: q.id, corrige: q.corrige, bareme: q.bareme })),
    reponses,
  )

  const dureeSecondes = Math.max(
    0,
    Math.round((maintenant.getTime() - tentative.creeLe.getTime()) / 1000),
  )

  await depot.enregistrerCorrection({
    tentativeId: tentative.id,
    statut: resultat.statut,
    score: resultat.score,
    scoreMax: resultat.scoreMax,
    dureeSecondes,
    reponses: reponses.map((r) => ({
      questionId: r.questionId,
      valeur: r.reponse,
      score: resultat.resultats.find((x) => x.questionId === r.questionId)?.score ?? null,
    })),
  })

  return succes({
    score: resultat.score,
    scoreMax: resultat.scoreMax,
    attendUnHumain: resultat.attendUnHumain,
    competences: evaluation.competences,
    parQuestion: resultat.resultats.map((r) => ({
      questionId: r.questionId,
      score: r.score,
      bareme: r.bareme,
    })),
  })
}
