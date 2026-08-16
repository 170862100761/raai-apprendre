/** Surface publique du module `evaluation`. */

export {
  corriger,
  lireCorrige,
  lireEnonce,
  lireReponse,
  SchemaCorrige,
  SchemaEnonce,
  SchemaReponse,
  type Appreciation,
  type Corrige,
  type Enonce,
  type Reponse,
  type TypeQuestion,
} from './domaine/question'

export {
  corrigerTentative,
  estModifiable,
  expiree,
  type ResultatTentative,
  type StatutTentative,
  type Tentative,
} from './domaine/tentative'

export {
  libelle as libelleEcheance,
  urgence,
  type Echeance,
  type TypeEvaluation,
  type Urgence,
} from './domaine/echeance'

export {
  appliquerNotes,
  noteRecevable,
  sansRetour,
  type CopieACorriger,
  type CopieCorrigee,
  type NoteEnseignant,
} from './domaine/correction'

export {
  chargerEcheances,
  type TableauDEcheances,
} from './application/echeances-a-venir'

export {
  chargerCopie,
  listerCopiesEnAttente,
  noterCopie,
  type CopieNotee,
} from './application/corriger-copies'

export {
  demarrerOuReprendre,
  soumettre,
  type Copie,
  type ResultatSoumission,
} from './application/passer-evaluation'

export {
  creerEvaluation,
  depublierEvaluation,
  enregistrerEvaluation,
  publierEvaluation,
  type QuestionSaisie,
} from './application/editer-evaluation'

export type {
  CopieEnAttente,
  CopiePourCorrection,
  DepotCorrection,
  DepotEvaluation,
  EvaluationEditable,
  EvaluationEnEdition,
  EvaluationPourEleve,
  QuestionAEnregistrer,
  QuestionCorrigeable,
  QuestionEnEdition,
  QuestionPourEleve,
  TentativeStockee,
} from './ports/depot-evaluation'

export { depotEvaluationPrisma } from './infrastructure/depot-evaluation-prisma'
