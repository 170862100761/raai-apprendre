import { describe, expect, it } from 'vitest'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantEvaluation } from '@/noyau/identifiants'
import type {
  DepotEvaluation,
  EvaluationEnEdition,
  QuestionAEnregistrer,
} from '../ports/depot-evaluation'
import {
  enregistrerEvaluation,
  publierEvaluation,
} from './editer-evaluation'

const EVAL = identifiant<IdentifiantEvaluation>('e-1')
const ETAB = 'etab-1'

/** Seules les méthodes d'édition sont réelles : le reste n'est pas appelé ici. */
function depotDouble() {
  const etat = {
    titre: 'Quiz',
    statut: 'brouillon' as string,
    questions: [] as QuestionAEnregistrer[],
  }
  const depot = {
    async chargerPourEdition(id: IdentifiantEvaluation, etablissementId: string) {
      if (id !== EVAL || etablissementId !== ETAB) return null
      return {
        id: EVAL,
        titre: etat.titre,
        type: 'quiz',
        statut: etat.statut,
        chapitre: 'Chapitre',
        questions: etat.questions,
      } satisfies EvaluationEnEdition
    },
    async modifierEvaluation(_id: IdentifiantEvaluation, _e: string, titre: string) {
      etat.titre = titre
    },
    async remplacerQuestions(
      _id: IdentifiantEvaluation,
      _e: string,
      questions: readonly QuestionAEnregistrer[],
    ) {
      etat.questions = [...questions]
    },
    async changerStatutEvaluation(_id: IdentifiantEvaluation, _e: string, statut: string) {
      etat.statut = statut
    },
  } as unknown as DepotEvaluation
  return { depot, etat }
}

const QCM_VALIDE = {
  intitule: 'Quelle grandeur détermine la vitesse d’un vérin ?',
  enonce: { type: 'qcm', propositions: ['Le débit', 'La pression'] },
  corrige: { type: 'qcm', bonnes: [0] },
  bareme: 2,
}

describe('enregistrerEvaluation', () => {
  it('garde les questions valides et compte les refusées, sans les taire', async () => {
    const { depot, etat } = depotDouble()
    const resultat = await enregistrerEvaluation(
      {
        evaluationId: EVAL,
        etablissementId: ETAB,
        titre: 'Quiz hydraulique',
        questions: [
          QCM_VALIDE,
          // Corrigé d'un autre type que l'énoncé : noterait tout à zéro.
          { ...QCM_VALIDE, corrige: { type: 'vrai_faux', bonne: true } },
          // Index de bonne réponse hors des propositions.
          { ...QCM_VALIDE, corrige: { type: 'qcm', bonnes: [7] } },
          // Barème nul : une question qui ne vaut rien n'évalue rien.
          { ...QCM_VALIDE, bareme: 0 },
        ],
      },
      depot,
    )

    expect(resultat.ok && resultat.valeur.questionsRefusees).toBe(3)
    expect(etat.questions).toHaveLength(1)
    expect(etat.titre).toBe('Quiz hydraulique')
  })

  it('refuse une évaluation hors établissement', async () => {
    const { depot } = depotDouble()
    const resultat = await enregistrerEvaluation(
      { evaluationId: EVAL, etablissementId: 'autre', titre: 'Quiz', questions: [] },
      depot,
    )
    expect(!resultat.ok && resultat.erreur.code).toBe('introuvable')
  })
})

describe('publierEvaluation', () => {
  it('refuse de publier une évaluation sans question', async () => {
    const { depot, etat } = depotDouble()
    const resultat = await publierEvaluation(EVAL, ETAB, depot)
    expect(!resultat.ok && resultat.erreur.code).toBe('regle_metier')
    expect(etat.statut).toBe('brouillon')
  })

  it('publie dès qu’une question existe', async () => {
    const { depot, etat } = depotDouble()
    await enregistrerEvaluation(
      { evaluationId: EVAL, etablissementId: ETAB, titre: 'Quiz', questions: [QCM_VALIDE] },
      depot,
    )
    const resultat = await publierEvaluation(EVAL, ETAB, depot)
    expect(resultat.ok && resultat.valeur.questions).toBe(1)
    expect(etat.statut).toBe('publiee')
  })
})
