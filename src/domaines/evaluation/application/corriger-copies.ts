import type { IdentifiantCompetence, IdentifiantTentative } from '@/noyau/identifiants'
import { echec, succes, type Resultat } from '@/noyau/resultat'
import { appliquerNotes, sansRetour, type NoteEnseignant } from '../domaine/correction'
import type {
  CopieEnAttente,
  CopiePourCorrection,
  DepotCorrection,
} from '../ports/depot-evaluation'

export type CopieNotee = {
  readonly tentativeId: IdentifiantTentative
  readonly score: number
  readonly scoreMax: number
  /** Vrai quand plus rien n'attend l'enseignant : la copie est close. */
  readonly close: boolean
  readonly restantes: readonly string[]
  /**
   * Questions notées sans un mot. Signalé, jamais bloquant — la présentation
   * décide d'en faire un avertissement ou rien du tout.
   */
  readonly sansCommentaire: readonly string[]
}

/** La pile de l'établissement. Vide n'est pas une erreur. */
export async function listerCopiesEnAttente(
  etablissementId: string,
  depot: DepotCorrection,
): Promise<readonly CopieEnAttente[]> {
  return depot.copiesEnAttente(etablissementId)
}

export async function chargerCopie(
  tentativeId: IdentifiantTentative,
  depot: DepotCorrection,
): Promise<Resultat<CopiePourCorrection>> {
  const copie = await depot.chargerPourCorrection(tentativeId)
  if (!copie) return echec('introuvable', 'Copie introuvable.')
  return succes(copie)
}

/**
 * Enregistre les notes d'un enseignant sur une copie.
 *
 * Le domaine tranche d'abord, la base écrit ensuite : une note hors barème ne
 * doit pas atteindre la couche de persistance, même refusée — c'est ce qui
 * garantit que la règle vaut aussi pour un futur import en masse.
 *
 * Ce cas d'usage ne touche pas aux compétences : `evaluation` ne sait pas ce
 * qu'est un acquis. La présentation appelle `progression` ensuite, avec les
 * compétences que renvoie ce module — c'est ce qui permet de faire évoluer la
 * notation sans toucher au suivi.
 */
export async function noterCopie(
  tentativeId: IdentifiantTentative,
  notes: readonly NoteEnseignant[],
  depot: DepotCorrection,
): Promise<Resultat<CopieNotee>> {
  if (notes.length === 0) {
    return echec('donnees_invalides', 'Aucune note saisie.')
  }

  const chargee = await depot.chargerPourCorrection(tentativeId)
  if (!chargee) return echec('introuvable', 'Copie introuvable.')

  const applique = appliquerNotes(chargee.copie, notes)
  if (!applique.ok) return applique

  const { score, scoreMax, statut, restantes } = applique.valeur

  await depot.enregistrerNotes({ tentativeId, statut, score, scoreMax, notes })

  return succes({
    tentativeId,
    score,
    scoreMax,
    close: restantes.length === 0,
    restantes,
    sansCommentaire: notes.filter(sansRetour).map((n) => n.questionId),
  })
}

/**
 * Les compétences visées par la copie, pour la couche de présentation.
 *
 * Renvoyées telles quelles, sans jugement : c'est `progression` qui décide de
 * ce qu'un score fait à un acquis, et notamment qu'il ne le dégrade jamais.
 */
export function competencesDeLaCopie(
  copie: CopiePourCorrection,
  competencesParEvaluation: ReadonlyMap<string, readonly IdentifiantCompetence[]>,
): readonly IdentifiantCompetence[] {
  return competencesParEvaluation.get(copie.evaluationId) ?? []
}
