import type {
  IdentifiantApprenant,
  IdentifiantCompetence,
  IdentifiantEvaluation,
  IdentifiantTentative,
} from '@/noyau/identifiants'
import type { CopieACorriger, NoteEnseignant } from '../domaine/correction'
import type { Echeance } from '../domaine/echeance'
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

/**
 * `DepotCorrection` est séparé et composé plutôt que fondu ici : la pile de
 * l'enseignant se lit et s'écrit sans rien savoir du passage d'une évaluation,
 * et un jour elle pourra vivre derrière son propre adaptateur.
 */
export interface DepotEvaluation extends DepotCorrection {
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

  /**
   * Les évaluations datées qui concernent cet élève.
   *
   * `borneHaute` vient du domaine, jamais de l'infrastructure : c'est une règle
   * de lecture — « jusqu'où regarde-t-on ? » — et la loger ici la rendrait
   * invisible et intestable. Il n'y a délibérément pas de borne basse : un
   * devoir en retard depuis trois semaines reste ce que l'élève doit voir en
   * premier, et l'oublier au bout de N jours serait décider à sa place.
   */
  echeancesDeLApprenant(
    apprenantId: IdentifiantApprenant,
    borneHaute: Date,
  ): Promise<readonly Echeance[]>

  /** Meilleure tentative achevée, pour l'affichage du résultat. */
  derniereTentative(
    evaluationId: IdentifiantEvaluation,
    apprenantId: IdentifiantApprenant,
  ): Promise<(TentativeStockee & { score: number | null; scoreMax: number | null }) | null>

  // --- Édition (enseignant) ------------------------------------------------

  evaluationsDeLEtablissement(
    etablissementId: string,
  ): Promise<readonly EvaluationEditable[]>

  /**
   * `null` si inexistante ou hors établissement — le cloisonnement se joue
   * ICI, pas dans l'écran : le dépôt ne passe pas par la RLS. Le corrigé y
   * figure : c'est l'auteur qui édite, pas l'élève qui passe.
   */
  chargerPourEdition(
    id: IdentifiantEvaluation,
    etablissementId: string,
  ): Promise<EvaluationEnEdition | null>

  creerEvaluation(entree: {
    chapitreId: string
    etablissementId: string
    titre: string
    type: string
  }): Promise<IdentifiantEvaluation>

  modifierEvaluation(
    id: IdentifiantEvaluation,
    etablissementId: string,
    titre: string,
  ): Promise<void>

  /** Remplace la totalité des questions — l'éditeur envoie l'état complet. */
  remplacerQuestions(
    id: IdentifiantEvaluation,
    etablissementId: string,
    questions: readonly QuestionAEnregistrer[],
  ): Promise<void>

  changerStatutEvaluation(
    id: IdentifiantEvaluation,
    etablissementId: string,
    statut: 'brouillon' | 'publiee',
  ): Promise<void>
}

export type EvaluationEditable = {
  readonly id: IdentifiantEvaluation
  readonly titre: string
  readonly type: string
  readonly statut: string
  readonly chapitre: string
  readonly nombreQuestions: number
}

export type QuestionEnEdition = {
  readonly intitule: string
  readonly enonce: Enonce
  readonly corrige: Corrige
  readonly bareme: number
}

export type EvaluationEnEdition = {
  readonly id: IdentifiantEvaluation
  readonly titre: string
  readonly type: string
  readonly statut: string
  readonly chapitre: string
  readonly questions: readonly QuestionEnEdition[]
}

export type QuestionAEnregistrer = {
  readonly intitule: string
  readonly enonce: Enonce
  readonly corrige: Corrige
  readonly bareme: number
}

/**
 * Une copie dans la pile de l'enseignant.
 *
 * Prénom et initiale, jamais le nom complet : en mode minimal il n'existe pas,
 * et l'écran doit se comporter pareil dans les deux modes.
 */
export type CopieEnAttente = {
  readonly tentativeId: IdentifiantTentative
  readonly apprenantId: IdentifiantApprenant
  readonly prenom: string
  readonly initialeNom: string
  readonly evaluationTitre: string
  readonly chapitre: string
  readonly soumiseLe: Date | null
  /** Nombre de questions qui attendent encore une note. */
  readonly aNoter: number
}

/**
 * Le détail d'une copie, côté enseignant.
 *
 * Le corrigé attendu y figure — ici c'est légitime et même nécessaire : la
 * règle « le corrigé ne sort jamais » protège l'élève avant soumission, pas
 * l'enseignant qui corrige après.
 */
export type QuestionCorrigeable = {
  readonly questionId: string
  readonly intitule: string
  readonly type: string
  readonly bareme: number
  /** `null` = attend l'enseignant. */
  readonly score: number | null
  readonly commentaire: string
  /** Ce que l'élève a écrit, brut. */
  readonly reponse: Reponse | null
  /** Ce qui était attendu. Absent pour les questions purement rédigées. */
  readonly corrige: Corrige | null
}

export type CopiePourCorrection = {
  readonly copie: CopieACorriger
  readonly apprenantId: IdentifiantApprenant
  readonly prenom: string
  readonly initialeNom: string
  readonly evaluationId: IdentifiantEvaluation
  readonly evaluationTitre: string
  readonly etablissementId: string
  readonly questions: readonly QuestionCorrigeable[]
}

export interface DepotCorrection {
  /** La pile de l'établissement, la plus ancienne d'abord. */
  copiesEnAttente(etablissementId: string): Promise<readonly CopieEnAttente[]>

  chargerPourCorrection(id: IdentifiantTentative): Promise<CopiePourCorrection | null>

  enregistrerNotes(entree: {
    tentativeId: IdentifiantTentative
    statut: StatutTentative
    score: number
    scoreMax: number
    notes: readonly NoteEnseignant[]
  }): Promise<void>
}

