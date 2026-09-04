import type { IdentifiantApprenant, IdentifiantCompetence } from '@/noyau/identifiants'
import type { CompetenceConnue } from '../domaine/score'

export type ScoreAEnregistrer = {
  readonly apprenantId: IdentifiantApprenant
  readonly etablissementId: string
  readonly jeu: string
  readonly score: number
  readonly scoreMax: number
  readonly part: number
  readonly joueLe: Date
}

export type MeilleurScoreJeu = {
  readonly score: number
  readonly scoreMax: number
  readonly part: number
  readonly joueLe: Date
}

export interface DepotScores {
  /** Renvoie l'identifiant de la ligne : c'est la source d'un acquis. */
  enregistrer(score: ScoreAEnregistrer): Promise<{ readonly id: string }>

  meilleurs(
    apprenantId: IdentifiantApprenant,
    jeux: readonly string[],
  ): Promise<ReadonlyMap<string, MeilleurScoreJeu>>

  /**
   * Les compétences du référentiel en vigueur qui portent l'un de ces codes,
   * ou dont le code de rang 1 en est le préfixe. La résolution elle-même est
   * dans le domaine ; ici on ne fait que charger de quoi la faire.
   */
  competencesPourCodes(
    codes: readonly string[],
  ): Promise<readonly CompetenceConnue<IdentifiantCompetence>[]>
}
