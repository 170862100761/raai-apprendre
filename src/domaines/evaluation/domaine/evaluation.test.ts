import { describe, expect, it } from 'vitest'
import { corriger, lireCorrige, lireEnonce, lireReponse } from './question'
import type { Corrige, Reponse } from './question'
import { corrigerTentative, expiree, estModifiable } from './tentative'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantEvaluation, IdentifiantTentative } from '@/noyau/identifiants'

const part = (corrige: Corrige, reponse: Reponse) => {
  const a = corriger(corrige, reponse)
  return a.type === 'automatique' ? a.part : null
}

describe('QCM', () => {
  const corrige: Corrige = { type: 'qcm', bonnes: [0, 2] }

  it('donne tout pour les deux bonnes réponses', () => {
    expect(part(corrige, { type: 'qcm', choisies: [0, 2] })).toBe(1)
  })

  it('donne une part pour une seule bonne réponse', () => {
    // Barème partiel : le tout-ou-rien pousse à ne rien cocher dès qu'on
    // hésite, et n'apprend rien de plus.
    expect(part(corrige, { type: 'qcm', choisies: [0] })).toBe(0.5)
  })

  it('retire pour une mauvaise réponse cochée', () => {
    expect(part(corrige, { type: 'qcm', choisies: [0, 1] })).toBe(0)
    expect(part(corrige, { type: 'qcm', choisies: [0, 2, 1] })).toBe(0.5)
  })

  it('ne descend jamais sous zéro', () => {
    // Tout cocher ne doit pas produire une note négative qui contaminerait le
    // reste du quiz.
    expect(part(corrige, { type: 'qcm', choisies: [1, 3] })).toBe(0)
  })

  it('donne zéro pour aucune réponse', () => {
    expect(part(corrige, { type: 'qcm', choisies: [] })).toBe(0)
  })
})

describe('numérique', () => {
  it('accepte dans la tolérance', () => {
    // 18 kW et 18,2 kW : c'est l'arrondi, pas l'incompréhension.
    const corrige: Corrige = { type: 'numerique', valeur: 18, tolerance: 0.5 }
    expect(part(corrige, { type: 'numerique', valeur: 18.2 })).toBe(1)
    expect(part(corrige, { type: 'numerique', valeur: 17.5 })).toBe(1)
    expect(part(corrige, { type: 'numerique', valeur: 19 })).toBe(0)
  })

  it('exige la valeur exacte quand la tolérance est nulle', () => {
    const corrige: Corrige = { type: 'numerique', valeur: 60, tolerance: 0 }
    expect(part(corrige, { type: 'numerique', valeur: 60 })).toBe(1)
    expect(part(corrige, { type: 'numerique', valeur: 60.1 })).toBe(0)
  })
})

describe('texte court', () => {
  const corrige: Corrige = {
    type: 'texte_court',
    acceptees: ['litres par minute', 'L/min'],
  }

  it('ignore la casse, les accents et la ponctuation finale', () => {
    for (const texte of ['Litres Par Minute', ' litres par minute. ', 'LITRES PAR MINUTE']) {
      expect(part(corrige, { type: 'texte_court', texte }), texte).toBe(1)
    }
  })

  it('accepte une autre formulation prévue', () => {
    expect(part(corrige, { type: 'texte_court', texte: 'l/min' })).toBe(1)
  })

  it('refuse une réponse différente', () => {
    expect(part(corrige, { type: 'texte_court', texte: 'bars' })).toBe(0)
  })
})

describe('appariement', () => {
  it('note au prorata des couples justes', () => {
    const corrige: Corrige = { type: 'appariement', couples: [1, 0, 2] }
    expect(part(corrige, { type: 'appariement', couples: [1, 0, 2] })).toBe(1)
    expect(part(corrige, { type: 'appariement', couples: [1, 2, 0] })).toBeCloseTo(1 / 3)
  })
})

describe('texte long', () => {
  it("n'invente pas de note : il attend un enseignant", () => {
    const a = corriger({ type: 'texte_long' }, { type: 'texte_long', texte: 'Une réponse.' })
    expect(a.type).toBe('humaine')
  })
})

describe('réponse incohérente avec la question', () => {
  it('vaut zéro plutôt que de lever', () => {
    // Cas réel : un formulaire falsifié, ou une question modifiée entre-temps.
    expect(
      part({ type: 'vrai_faux', bonne: true }, { type: 'numerique', valeur: 1 } as Reponse),
    ).toBe(0)
  })
})

describe('correction d’une tentative complète', () => {
  const questions = [
    { questionId: 'q1', bareme: 2, corrige: { type: 'vrai_faux', bonne: true } as Corrige },
    { questionId: 'q2', bareme: 3, corrige: { type: 'qcm', bonnes: [0, 1] } as Corrige },
  ]

  it('additionne les points et le barème', () => {
    const r = corrigerTentative(questions, [
      { questionId: 'q1', reponse: { type: 'vrai_faux', valeur: true } },
      { questionId: 'q2', reponse: { type: 'qcm', choisies: [0, 1] } },
    ])
    expect(r.score).toBe(5)
    expect(r.scoreMax).toBe(5)
    expect(r.statut).toBe('corrigee_auto')
  })

  it('compte zéro pour une question sans réponse, sans la retirer du barème', () => {
    // Sinon l'élève qui ne répond à rien aurait la moyenne sur ce qu'il a
    // répondu.
    const r = corrigerTentative(questions, [
      { questionId: 'q1', reponse: { type: 'vrai_faux', valeur: true } },
    ])
    expect(r.score).toBe(2)
    expect(r.scoreMax).toBe(5)
  })

  it('bascule en attente de correction dès une question ouverte', () => {
    const r = corrigerTentative(
      [...questions, { questionId: 'q3', bareme: 5, corrige: { type: 'texte_long' } }],
      [{ questionId: 'q3', reponse: { type: 'texte_long', texte: 'Ma réponse.' } }],
    )
    expect(r.attendUnHumain).toBe(true)
    expect(r.statut).toBe('attente_correction')
    // Le barème de la question ouverte compte déjà dans le total.
    expect(r.scoreMax).toBe(10)
    expect(r.resultats.find((x) => x.questionId === 'q3')?.score).toBeNull()
  })

  it('arrondit à deux décimales', () => {
    const r = corrigerTentative(
      [{ questionId: 'q', bareme: 1, corrige: { type: 'appariement', couples: [0, 1, 2] } }],
      [{ questionId: 'q', reponse: { type: 'appariement', couples: [0, 9, 9] } }],
    )
    expect(r.score).toBe(0.33)
  })
})

describe('cycle de vie', () => {
  const tentative = (creeLe: Date) => ({
    id: identifiant<IdentifiantTentative>('t'),
    evaluationId: identifiant<IdentifiantEvaluation>('e'),
    statut: 'en_cours' as const,
    creeLe,
  })

  it("seule une tentative en cours accepte des réponses", () => {
    expect(estModifiable('en_cours')).toBe(true)
    for (const statut of ['soumise', 'corrigee', 'corrigee_auto', 'abandonnee'] as const) {
      expect(estModifiable(statut), statut).toBe(false)
    }
  })

  it("sans durée imposée, une tentative n'expire pas", () => {
    const debut = new Date('2026-09-15T09:00:00Z')
    const tard = new Date('2026-09-16T09:00:00Z')
    expect(expiree(tentative(debut), null, tard)).toBe(false)
  })

  it('laisse une minute de marge pour les réseaux ruraux', () => {
    const debut = new Date('2026-09-15T09:00:00Z')
    const a30 = new Date('2026-09-15T09:30:30Z')
    const a32 = new Date('2026-09-15T09:32:00Z')

    // Un élève dont la connexion coupe à la dernière seconde ne doit pas
    // perdre son travail pour un aléa de réseau.
    expect(expiree(tentative(debut), 30, a30)).toBe(false)
    expect(expiree(tentative(debut), 30, a32)).toBe(true)
  })
})

describe('lecture des données de la base', () => {
  it('refuse un énoncé, un corrigé ou une réponse mal formés', () => {
    expect(lireEnonce({ type: 'qcm', propositions: ['une seule'] })).toBeNull()
    expect(lireCorrige({ type: 'qcm', bonnes: [] })).toBeNull()
    expect(lireReponse({ type: 'inconnu' })).toBeNull()
  })

  it('applique la tolérance par défaut à zéro', () => {
    const corrige = lireCorrige({ type: 'numerique', valeur: 18 })
    expect(corrige).toEqual({ type: 'numerique', valeur: 18, tolerance: 0 })
  })
})
