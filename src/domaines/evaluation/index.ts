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
  demarrerOuReprendre,
  soumettre,
  type Copie,
  type ResultatSoumission,
} from './application/passer-evaluation'

export type {
  DepotEvaluation,
  EvaluationPourEleve,
  QuestionPourEleve,
  TentativeStockee,
} from './ports/depot-evaluation'

export { depotEvaluationPrisma } from './infrastructure/depot-evaluation-prisma'
