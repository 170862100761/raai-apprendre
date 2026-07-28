/**
 * La grille de suivi : élèves en lignes, compétences en colonnes.
 *
 * C'est l'écran que les établissements attendent le plus, et pour une raison
 * précise : il répond à la question d'inspection « prouvez-moi que le
 * référentiel est couvert », et à celle de l'enseignant « qui bloque, et sur
 * quoi ». Une seule vue, pas quatorze indicateurs.
 *
 * Tout ici est pur : la grille arrive de la base, les lectures qu'on en fait
 * se testent sans base.
 */
import type { IdentifiantApprenant, IdentifiantCompetence } from '@/noyau/identifiants'
import type { NiveauAcquisition } from './acquisition'

export type LigneApprenant = {
  readonly id: IdentifiantApprenant
  readonly prenom: string
  readonly initialeNom: string
  readonly vuLe: Date | null
}

export type ColonneCompetence = {
  readonly id: IdentifiantCompetence
  readonly code: string
  readonly intitule: string
}

export type Cellule = {
  readonly apprenantId: IdentifiantApprenant
  readonly competenceId: IdentifiantCompetence
  readonly niveau: NiveauAcquisition
}

export type Grille = {
  readonly apprenants: readonly LigneApprenant[]
  readonly competences: readonly ColonneCompetence[]
  readonly cellules: readonly Cellule[]
}

/** Clé de cellule. Une seule forme, pour qu'aucun appelant n'invente la sienne. */
export const cle = (
  apprenantId: IdentifiantApprenant,
  competenceId: IdentifiantCompetence,
): string => `${apprenantId}|${competenceId}`

export function indexer(grille: Grille): ReadonlyMap<string, NiveauAcquisition> {
  return new Map(grille.cellules.map((c) => [cle(c.apprenantId, c.competenceId), c.niveau]))
}

export const niveauDe = (
  index: ReadonlyMap<string, NiveauAcquisition>,
  apprenantId: IdentifiantApprenant,
  competenceId: IdentifiantCompetence,
): NiveauAcquisition => index.get(cle(apprenantId, competenceId)) ?? 'non_abordee'

const VALIDES: readonly NiveauAcquisition[] = ['acquise', 'maitrisee']

/** Part de compétences validées, pour un élève. */
export function avancement(
  grille: Grille,
  index: ReadonlyMap<string, NiveauAcquisition>,
  apprenantId: IdentifiantApprenant,
): number {
  if (grille.competences.length === 0) return 0
  const valides = grille.competences.filter((c) =>
    VALIDES.includes(niveauDe(index, apprenantId, c.id)),
  ).length
  return valides / grille.competences.length
}

/**
 * Compétences sur lesquelles la classe bloque.
 *
 * Un enseignant n'a pas le temps de lire une grille de 24 × 10 cases : il a
 * besoin qu'on lui désigne les deux colonnes qui coincent.
 */
export function competencesEnDifficulte(
  grille: Grille,
  index: ReadonlyMap<string, NiveauAcquisition>,
  seuil = 0.5,
): readonly { competence: ColonneCompetence; partValidee: number }[] {
  if (grille.apprenants.length === 0) return []

  return grille.competences
    .map((competence) => ({
      competence,
      partValidee:
        grille.apprenants.filter((a) => VALIDES.includes(niveauDe(index, a.id, competence.id)))
          .length / grille.apprenants.length,
    }))
    .filter((c) => c.partValidee < seuil)
    .sort((a, b) => a.partValidee - b.partValidee)
}

export const JOURS_AVANT_SIGNALEMENT = 14

/**
 * Élèves sans connexion depuis deux semaines.
 *
 * Seuil fixe et lisible, assumé pour le MVP : la détection de décrochage par
 * l'IA viendra en V1. Un enseignant peut expliquer « il ne s'est pas connecté
 * depuis 14 jours » ; il ne peut pas expliquer un score de risque.
 *
 * Un élève qui ne s'est JAMAIS connecté n'est pas signalé ici : c'est un compte
 * distribué mais jamais utilisé, ce qui relève de la mise en route de la
 * classe, pas du décrochage.
 */
export function sansConnexionRecente(
  apprenants: readonly LigneApprenant[],
  maintenant: Date,
  jours = JOURS_AVANT_SIGNALEMENT,
): readonly LigneApprenant[] {
  const limite = maintenant.getTime() - jours * 86_400_000
  return apprenants.filter((a) => a.vuLe !== null && a.vuLe.getTime() < limite)
}

/** Élèves qui n'ont jamais ouvert la plateforme. */
export const jamaisConnectes = (
  apprenants: readonly LigneApprenant[],
): readonly LigneApprenant[] => apprenants.filter((a) => a.vuLe === null)

/**
 * Couverture du référentiel par la classe : part des compétences validées par
 * au moins un élève.
 *
 * Ce n'est pas une moyenne de réussite mais un indicateur de programme : une
 * colonne où personne n'a rien validé signale un chapitre non traité, pas une
 * classe faible.
 */
export function couvertureReferentiel(
  grille: Grille,
  index: ReadonlyMap<string, NiveauAcquisition>,
): number {
  if (grille.competences.length === 0) return 0

  const abordees = grille.competences.filter((competence) =>
    grille.apprenants.some((a) => niveauDe(index, a.id, competence.id) !== 'non_abordee'),
  ).length

  return abordees / grille.competences.length
}
