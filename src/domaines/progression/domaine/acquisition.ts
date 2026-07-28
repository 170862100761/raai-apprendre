/**
 * Traduire un résultat d'évaluation en niveau d'acquisition.
 *
 * C'est le point le plus délicat du suivi de compétences, et il est
 * volontairement conservateur : une évaluation fait **monter** un acquis,
 * jamais descendre.
 *
 * Un élève qui a validé une compétence puis rate un quiz reste validé. Sans
 * cette règle, la validation de compétences devient anxiogène, les élèves
 * cessent de tenter, et le suivi ne mesure plus que la prudence.
 */
import type { IdentifiantCompetence } from '@/noyau/identifiants'

export type NiveauAcquisition = 'non_abordee' | 'en_cours' | 'acquise' | 'maitrisee'

export type OrigineAcquis = 'evaluation' | 'declaration_enseignant' | 'ccf' | 'import'

const RANG: Record<NiveauAcquisition, number> = {
  non_abordee: 0,
  en_cours: 1,
  acquise: 2,
  maitrisee: 3,
}

/** Seuil de validation. En dessous, la compétence est « en cours », pas ratée. */
export const SEUIL_ACQUISE = 0.7
export const JOURS_ENTRE_DEUX_CONSTATS = 7

export type AcquisExistant = {
  readonly niveau: NiveauAcquisition
  readonly constateLe: Date
}

export type Constat = {
  readonly competenceId: IdentifiantCompetence
  /** Part du barème obtenue sur les questions rattachées à cette compétence. */
  readonly part: number
  readonly survenuLe: Date
}

export type Evolution = {
  readonly competenceId: IdentifiantCompetence
  readonly niveau: NiveauAcquisition
  readonly score: number
  readonly origine: OrigineAcquis
  /** Faux quand rien ne change : inutile d'écrire, inutile de notifier. */
  readonly modifie: boolean
}

/**
 * Niveau qu'un constat isolé permet d'atteindre.
 *
 * Jamais `maitrisee` : la maîtrise demande deux constats espacés — une réussite
 * unique peut être un coup de chance, et le référentiel demande un comportement
 * stable, pas un exploit.
 */
function niveauDuConstat(part: number): NiveauAcquisition {
  if (part >= SEUIL_ACQUISE) return 'acquise'
  if (part > 0) return 'en_cours'
  return 'en_cours'
}

export function evaluerAcquisition(
  constat: Constat,
  existant: AcquisExistant | null,
): Evolution {
  const propose = niveauDuConstat(constat.part)

  if (!existant) {
    return {
      competenceId: constat.competenceId,
      niveau: propose,
      score: constat.part,
      origine: 'evaluation',
      modifie: true,
    }
  }

  // Deuxième validation espacée d'au moins une semaine : la compétence est
  // maîtrisée, pas seulement acquise un jour donné.
  const joursEcoules =
    (constat.survenuLe.getTime() - existant.constateLe.getTime()) / 86_400_000

  if (
    existant.niveau === 'acquise' &&
    propose === 'acquise' &&
    joursEcoules >= JOURS_ENTRE_DEUX_CONSTATS
  ) {
    return {
      competenceId: constat.competenceId,
      niveau: 'maitrisee',
      score: constat.part,
      origine: 'evaluation',
      modifie: true,
    }
  }

  // Le cœur de la règle : on garde le meilleur des deux.
  const retenu = RANG[propose] > RANG[existant.niveau] ? propose : existant.niveau

  return {
    competenceId: constat.competenceId,
    niveau: retenu,
    score: constat.part,
    origine: 'evaluation',
    modifie: retenu !== existant.niveau,
  }
}

/**
 * Déclaration d'un enseignant : elle l'emporte, y compris à la baisse.
 *
 * C'est la seule voie de dégradation, et c'est voulu — un enseignant qui
 * constate qu'un élève ne sait plus faire doit pouvoir le dire.
 */
export function declarer(
  competenceId: IdentifiantCompetence,
  niveau: NiveauAcquisition,
  existant: AcquisExistant | null,
): Evolution {
  return {
    competenceId,
    niveau,
    score: RANG[niveau] / RANG.maitrisee,
    origine: 'declaration_enseignant',
    modifie: existant?.niveau !== niveau,
  }
}

/**
 * Répartit le résultat d'une tentative sur les compétences visées.
 *
 * Simplification assumée du MVP : toutes les compétences d'une évaluation
 * reçoivent la même part globale. Rattacher chaque question à une compétence
 * donnerait plus fin, mais demanderait à l'enseignant un travail de saisie
 * qu'il ne fera pas — et un suivi que personne ne remplit ne vaut rien.
 */
export function repartir(
  competences: readonly IdentifiantCompetence[],
  score: number,
  scoreMax: number,
  survenuLe: Date,
): readonly Constat[] {
  const part = scoreMax > 0 ? score / scoreMax : 0
  return competences.map((competenceId) => ({ competenceId, part, survenuLe }))
}
