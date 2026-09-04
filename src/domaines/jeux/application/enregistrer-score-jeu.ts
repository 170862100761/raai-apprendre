import type { IdentifiantApprenant } from '@/noyau/identifiants'
import { echec, succes, type Resultat } from '@/noyau/resultat'
import {
  enregistrerResultat,
  type DepotProgression,
  type Evolution,
} from '@/domaines/progression'
import { calculerPart, comptePourLaProgression, resoudreCapacites } from '../domaine/score'
import type { DepotScores } from '../ports/depot-scores'

export type PartieTerminee = {
  readonly apprenantId: IdentifiantApprenant
  readonly etablissementId: string
  /** La clé du jeu, telle qu'écrite dans `contenu/jeux/*.json`. */
  readonly jeu: string
  /** Les codes de capacités que le jeu déclare travailler. */
  readonly capacites: readonly string[]
  readonly score: number
  readonly scoreMax: number
  readonly joueLe: Date
}

export type ScoreEnregistre = {
  readonly id: string
  readonly part: number
  /** Vide quand la partie ne compte pas, ou ne fait bouger aucune compétence. */
  readonly evolutions: readonly Evolution[]
}

/**
 * Garde la partie, puis — seulement au-dessus du seuil — la fait compter
 * comme un résultat d'évaluation sur les compétences du jeu.
 *
 * Le score est écrit d'abord et sert de source à l'acquis : un acquis doit
 * toujours répondre à « d'où vient cette validation ? », et la réponse est une
 * ligne de `score_jeu`, pas une chaîne libre. La règle « un acquis ne se
 * dégrade pas » vit dans `progression` : on lui passe le résultat, on ne la
 * réimplémente pas.
 */
export async function enregistrerScoreJeu(
  partie: PartieTerminee,
  depots: { readonly scores: DepotScores; readonly progression: DepotProgression },
): Promise<Resultat<ScoreEnregistre>> {
  if (
    !Number.isFinite(partie.score) ||
    !Number.isFinite(partie.scoreMax) ||
    partie.scoreMax <= 0
  ) {
    return echec('donnees_invalides', 'Score illisible.')
  }

  const part = calculerPart(partie)

  const { id } = await depots.scores.enregistrer({
    apprenantId: partie.apprenantId,
    etablissementId: partie.etablissementId,
    jeu: partie.jeu,
    score: Math.max(0, Math.round(partie.score)),
    scoreMax: Math.round(partie.scoreMax),
    part,
    joueLe: partie.joueLe,
  })

  if (!comptePourLaProgression(part) || partie.capacites.length === 0) {
    return succes({ id, part, evolutions: [] })
  }

  const connues = await depots.scores.competencesPourCodes(partie.capacites)
  const competences = resoudreCapacites(partie.capacites, connues)

  const evolutions = await enregistrerResultat(
    {
      apprenantId: partie.apprenantId,
      etablissementId: partie.etablissementId,
      competences,
      score: partie.score,
      scoreMax: partie.scoreMax,
      sourceId: id,
      survenuLe: partie.joueLe,
    },
    depots.progression,
  )

  return succes({ id, part, evolutions })
}
