/**
 * Ce qu'un score de jeu vaut pour la progression.
 *
 * Un jeu est de l'entraînement, pas une évaluation : on ne lui fait porter un
 * constat d'acquisition qu'à partir d'une réussite nette. Le seuil est plus
 * haut que celui d'une évaluation (0,7) parce qu'une partie se rejoue à volonté
 * et qu'on finit toujours par y arriver — c'est la part obtenue, pas la
 * persévérance, qui doit compter.
 */

export const SEUIL_PROGRESSION = 0.8

export type ScoreDePartie = {
  readonly score: number
  readonly scoreMax: number
}

/** Entre 0 et 1, quoi qu'envoie le navigateur. */
export function calculerPart({ score, scoreMax }: ScoreDePartie): number {
  if (!(scoreMax > 0) || !(score >= 0)) return 0
  return Math.min(1, score / scoreMax)
}

export const comptePourLaProgression = (part: number): boolean => part >= SEUIL_PROGRESSION

/** Ce que le résolveur a besoin de savoir d'une compétence du référentiel. */
export type CompetenceConnue<Id extends string = string> = {
  readonly id: Id
  readonly code: string
  /** `null` pour une capacité de rang 1. */
  readonly parentId: string | null
}

/**
 * Traduit les codes d'un jeu (« C5.1 ») en compétences du référentiel.
 *
 * Code exact d'abord ; sinon la capacité de rang 1 dont il dérive (« C5 »),
 * pour qu'un jeu écrit contre une sous-capacité absente d'un référentiel plus
 * ancien nourrisse quand même la bonne colonne de la grille. Un code qui ne
 * correspond à rien est ignoré : un jeu mal étiqueté ne doit ni planter la
 * partie, ni valider une compétence au hasard.
 *
 * Sans doublon : deux codes qui retombent sur le même parent ne comptent
 * qu'une fois, sinon `repartir` écrirait deux fois le même acquis.
 */
export function resoudreCapacites<Id extends string>(
  codes: readonly string[],
  connues: readonly CompetenceConnue<Id>[],
): readonly Id[] {
  const parCode = new Map(connues.map((c) => [c.code, c]))
  const retenues: Id[] = []

  for (const code of codes) {
    const exacte = parCode.get(code)
    const rang1 = parCode.get(code.split('.')[0] ?? code)
    const candidate = exacte ?? (rang1 && rang1.parentId === null ? rang1 : undefined)

    if (candidate && !retenues.includes(candidate.id)) retenues.push(candidate.id)
  }

  return retenues
}
