import type {
  IdentifiantApprenant,
  IdentifiantCompetence,
  IdentifiantEvaluation,
  IdentifiantTentative,
} from '@/noyau/identifiants'
import type { Enonce, Corrige, Reponse } from '../domaine/question'
import type { StatutTentative } from '../domaine/tentative'

/** Ce qui part chez l'élève. Le corrigé n'y figure pas, par construction. */
export type QuestionPourEleve = {
  readonly id: string
  readonly intitule: string
  readonly enonce: Enonce
  readonly bareme: number
  readonly ordre: number
}

export type EvaluationPourEleve = {
  readonly id: IdentifiantEvaluation
  readonly titre: string
  readonly type: string
  readonly dureeMaxMin: number | null
  readonly questions: readonly QuestionPourEleve[]
  readonly competences: readonly IdentifiantCompetence[]
  readonly etablissementId: string
}

/** Réservé à la correction, côté serveur. Ne traverse jamais le réseau. */
export type QuestionAvecCorrige = {
  readonly id: string
  readonly corrige: Corrige
  readonly bareme: number
}

export type TentativeStockee = {
  readonly id: IdentifiantTentative
  readonly evaluationId: IdentifiantEvaluation
  readonly apprenantId: IdentifiantApprenant
  readonly statut: StatutTentative
  readonly creeLe: Date
}

export interface DepotEvaluation {
  /** `null` si inexistante, non publiée, ou hors périmètre. */
  chargerPourEleve(id: IdentifiantEvaluation): Promise<EvaluationPourEleve | null>

  /** Les corrigés. Appelé uniquement à la soumission. */
  chargerCorriges(id: IdentifiantEvaluation): Promise<readonly QuestionAvecCorrige[]>

  tentativeEnCours(
    evaluationId: IdentifiantEvaluation,
    apprenantId: IdentifiantApprenant,
  ): Promise<TentativeStockee | null>

  demarrerTentative(entree: {
    evaluationId: IdentifiantEvaluation
    apprenantId: IdentifiantApprenant
    etablissementId: string
  }): Promise<TentativeStockee>

  enregistrerCorrection(entree: {
    tentativeId: IdentifiantTentative
    statut: StatutTentative
    score: number
    scoreMax: number
    dureeSecondes: number
    reponses: readonly {
      questionId: string
      valeur: Reponse
      score: number | null
    }[]
  }): Promise<void>

  /** Meilleure tentative achevée, pour l'affichage du résultat. */
  derniereTentative(
    evaluationId: IdentifiantEvaluation,
    apprenantId: IdentifiantApprenant,
  ): Promise<(TentativeStockee & { score: number | null; scoreMax: number | null }) | null>
}
