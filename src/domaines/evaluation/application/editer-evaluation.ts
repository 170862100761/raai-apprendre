import { succes, type Resultat } from '@/noyau/resultat'
import type { IdentifiantEvaluation } from '@/noyau/identifiants'
import { SchemaCorrige, SchemaEnonce } from '../domaine/question'
import type { TypeEvaluation } from '../domaine/echeance'
import type { DepotEvaluation, QuestionAEnregistrer } from '../ports/depot-evaluation'

/**
 * Édition des évaluations par l'enseignant.
 *
 * Même philosophie que l'éditeur de leçons : tout arrive en brouillon, une
 * question invalide est écartée en le disant — jamais en silence — et la
 * publication refuse une évaluation vide. L'énoncé et le corrigé de chaque
 * question sont validés par les schémas du domaine : ce qui entre en base est
 * exactement ce que la correction automatique saura noter.
 */

export type QuestionSaisie = {
  readonly intitule: unknown
  readonly enonce: unknown
  readonly corrige: unknown
  readonly bareme: unknown
}

function validerQuestion(saisie: QuestionSaisie): QuestionAEnregistrer | null {
  if (typeof saisie.intitule !== 'string' || saisie.intitule.trim().length < 3) return null

  const enonce = SchemaEnonce.safeParse(saisie.enonce)
  const corrige = SchemaCorrige.safeParse(saisie.corrige)
  if (!enonce.success || !corrige.success) return null
  // Un énoncé QCM avec un corrigé vrai/faux noterait tout à zéro.
  if (enonce.data.type !== corrige.data.type) return null

  if (enonce.data.type === 'qcm') {
    const bornes = enonce.data.propositions.length
    if (corrige.data.type === 'qcm' && corrige.data.bonnes.some((i) => i >= bornes)) return null
  }

  const bareme = Number(saisie.bareme)
  if (!Number.isFinite(bareme) || bareme <= 0 || bareme > 100) return null

  return {
    intitule: saisie.intitule.trim(),
    enonce: enonce.data,
    corrige: corrige.data,
    bareme,
  }
}

export async function creerEvaluation(
  entree: {
    readonly chapitreId: string
    readonly etablissementId: string
    readonly titre: string
    readonly type: TypeEvaluation
  },
  depot: DepotEvaluation,
): Promise<Resultat<{ evaluationId: IdentifiantEvaluation }>> {
  if (entree.titre.trim().length < 3) {
    return {
      ok: false,
      erreur: {
        code: 'donnees_invalides',
        message: 'Un titre d’au moins trois caractères est requis.',
        champs: { titre: 'Au moins trois caractères.' },
      },
    }
  }
  const evaluationId = await depot.creerEvaluation({
    chapitreId: entree.chapitreId,
    etablissementId: entree.etablissementId,
    titre: entree.titre.trim(),
    type: entree.type,
  })
  return succes({ evaluationId })
}

export async function enregistrerEvaluation(
  entree: {
    readonly evaluationId: IdentifiantEvaluation
    readonly etablissementId: string
    readonly titre: string
    readonly questions: readonly QuestionSaisie[]
  },
  depot: DepotEvaluation,
): Promise<Resultat<{ questionsRefusees: number }>> {
  if (entree.titre.trim().length < 3) {
    return {
      ok: false,
      erreur: { code: 'donnees_invalides', message: 'Un titre d’au moins trois caractères est requis.' },
    }
  }

  const existante = await depot.chargerPourEdition(entree.evaluationId, entree.etablissementId)
  if (!existante) {
    return { ok: false, erreur: { code: 'introuvable', message: 'Évaluation introuvable.' } }
  }

  const retenues = entree.questions.map(validerQuestion).filter(
    (q): q is QuestionAEnregistrer => q !== null,
  )

  await depot.modifierEvaluation(entree.evaluationId, entree.etablissementId, entree.titre.trim())
  await depot.remplacerQuestions(entree.evaluationId, entree.etablissementId, retenues)

  return succes({ questionsRefusees: entree.questions.length - retenues.length })
}

/** La publication refuse une évaluation vide : proposer un quiz sans question
 *  à un élève, c'est promettre une note qui n'existera jamais. */
export async function publierEvaluation(
  evaluationId: IdentifiantEvaluation,
  etablissementId: string,
  depot: DepotEvaluation,
): Promise<Resultat<{ questions: number }>> {
  const evaluation = await depot.chargerPourEdition(evaluationId, etablissementId)
  if (!evaluation) {
    return { ok: false, erreur: { code: 'introuvable', message: 'Évaluation introuvable.' } }
  }
  if (evaluation.questions.length === 0) {
    return {
      ok: false,
      erreur: {
        code: 'regle_metier',
        message: 'Ajoute au moins une question avant de publier.',
      },
    }
  }
  await depot.changerStatutEvaluation(evaluationId, etablissementId, 'publiee')
  return succes({ questions: evaluation.questions.length })
}

export async function depublierEvaluation(
  evaluationId: IdentifiantEvaluation,
  etablissementId: string,
  depot: DepotEvaluation,
): Promise<Resultat<null>> {
  const evaluation = await depot.chargerPourEdition(evaluationId, etablissementId)
  if (!evaluation) {
    return { ok: false, erreur: { code: 'introuvable', message: 'Évaluation introuvable.' } }
  }
  await depot.changerStatutEvaluation(evaluationId, etablissementId, 'brouillon')
  return succes(null)
}
