/**
 * Surface publique du module `jeux`.
 *
 * Le module est supprimable d'un bloc : sans lui, les jeux restent jouables et
 * les scores restent dans le navigateur. Il ne fait qu'une chose — garder les
 * parties en base et, au-dessus d'un seuil, les faire compter dans la
 * progression via `progression`.
 */

export {
  calculerPart,
  comptePourLaProgression,
  resoudreCapacites,
  SEUIL_PROGRESSION,
  type CompetenceConnue,
} from './domaine/score'

export {
  enregistrerScoreJeu,
  type PartieTerminee,
  type ScoreEnregistre,
} from './application/enregistrer-score-jeu'

export type { DepotScores, MeilleurScoreJeu, ScoreAEnregistrer } from './ports/depot-scores'

export { depotScoresPrisma } from './infrastructure/depot-scores-prisma'
