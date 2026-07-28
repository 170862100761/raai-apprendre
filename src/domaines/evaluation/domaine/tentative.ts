/**
 * La tentative : ce qu'un élève a répondu, et ce que ça vaut.
 *
 * Une tentative corrigée est **immuable**. Réviser une note crée une nouvelle
 * tentative liée à la précédente. Sans cette règle, une note peut changer sans
 * trace, et plus personne ne peut répondre à « pourquoi ai-je eu 12 ? ».
 */
import type { IdentifiantEvaluation, IdentifiantTentative } from '@/noyau/identifiants'
import { corriger, type Corrige, type Reponse } from './question'

export type StatutTentative =
  | 'en_cours'
  | 'soumise'
  | 'corrigee_auto'
  | 'attente_correction'
  | 'corrigee'
  | 'abandonnee'

export type QuestionACorriger = {
  readonly questionId: string
  readonly corrige: Corrige
  readonly bareme: number
}

export type ReponseDonnee = {
  readonly questionId: string
  readonly reponse: Reponse
}

export type ResultatQuestion = {
  readonly questionId: string
  readonly bareme: number
  /** `null` quand la correction attend un enseignant. */
  readonly score: number | null
}

export type ResultatTentative = {
  readonly resultats: readonly ResultatQuestion[]
  /** Points obtenus sur les questions corrigées automatiquement. */
  readonly score: number
  /** Barème total, questions ouvertes comprises. */
  readonly scoreMax: number
  readonly statut: StatutTentative
  /** Vrai si au moins une question attend un enseignant. */
  readonly attendUnHumain: boolean
}

/**
 * Corrige une tentative complète.
 *
 * Une question sans réponse vaut zéro, elle ne disparaît pas du barème : sinon
 * l'élève qui ne répond à rien aurait la moyenne sur ce qu'il a répondu.
 */
export function corrigerTentative(
  questions: readonly QuestionACorriger[],
  reponses: readonly ReponseDonnee[],
): ResultatTentative {
  const parQuestion = new Map(reponses.map((r) => [r.questionId, r.reponse]))

  const resultats: ResultatQuestion[] = questions.map((question) => {
    const reponse = parQuestion.get(question.questionId)
    if (!reponse) return { questionId: question.questionId, bareme: question.bareme, score: 0 }

    const appreciation = corriger(question.corrige, reponse)
    return {
      questionId: question.questionId,
      bareme: question.bareme,
      score:
        appreciation.type === 'humaine'
          ? null
          : arrondir(appreciation.part * question.bareme),
    }
  })

  const attendUnHumain = resultats.some((r) => r.score === null)

  return {
    resultats,
    score: arrondir(resultats.reduce((total, r) => total + (r.score ?? 0), 0)),
    scoreMax: arrondir(questions.reduce((total, q) => total + q.bareme, 0)),
    statut: attendUnHumain ? 'attente_correction' : 'corrigee_auto',
    attendUnHumain,
  }
}

/** Deux décimales : au-delà, on affiche du bruit de calcul flottant. */
const arrondir = (valeur: number) => Math.round(valeur * 100) / 100

export type Tentative = {
  readonly id: IdentifiantTentative
  readonly evaluationId: IdentifiantEvaluation
  readonly statut: StatutTentative
  readonly creeLe: Date
}

/** Ce qui peut encore être soumis. */
export const estModifiable = (statut: StatutTentative): boolean => statut === 'en_cours'

/**
 * Une tentative dépasse-t-elle son temps imparti ?
 *
 * Marge d'une minute : un élève dont la connexion coupe à la dernière seconde
 * ne doit pas perdre son travail pour un aléa de réseau rural.
 */
export function expiree(
  tentative: Tentative,
  dureeMaxMin: number | null,
  maintenant: Date,
): boolean {
  if (dureeMaxMin === null) return false
  const ecoule = (maintenant.getTime() - tentative.creeLe.getTime()) / 60_000
  return ecoule > dureeMaxMin + 1
}
