import { describe, expect, it } from 'vitest'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantTentative } from '@/noyau/identifiants'
import {
  appliquerNotes,
  noteRecevable,
  sansRetour,
  type CopieACorriger,
} from './correction'

const TENTATIVE = identifiant<IdentifiantTentative>('00000000-0000-4000-8000-0000000000aa')

/** Une copie type : deux questions automatiques tranchées, deux rédigées. */
const copie = (
  questions: CopieACorriger['questions'],
  statut: CopieACorriger['statut'] = 'attente_correction',
): CopieACorriger => ({ tentativeId: TENTATIVE, statut, questions })

const MIXTE = copie([
  { questionId: 'q1', bareme: 2, score: 2 },
  { questionId: 'q2', bareme: 3, score: 1.5 },
  { questionId: 'q3', bareme: 4, score: null },
  { questionId: 'q4', bareme: 1, score: null },
])

describe('noteRecevable', () => {
  it('accepte les bornes du barème', () => {
    expect(noteRecevable(0, 4)).toBe(true)
    expect(noteRecevable(4, 4)).toBe(true)
    expect(noteRecevable(2.5, 4)).toBe(true)
  })

  it('refuse au-delà du barème', () => {
    // Le cas réel : 20 saisi sur une question qui en vaut 2.
    expect(noteRecevable(20, 2)).toBe(false)
  })

  it('refuse une note négative', () => {
    expect(noteRecevable(-1, 4)).toBe(false)
  })

  it('refuse ce qui n’est pas un nombre fini', () => {
    expect(noteRecevable(Number.NaN, 4)).toBe(false)
    expect(noteRecevable(Number.POSITIVE_INFINITY, 4)).toBe(false)
  })
})

describe('sansRetour', () => {
  it('repère une note nue', () => {
    expect(sansRetour({ questionId: 'q3', score: 2, commentaire: '   ' })).toBe(true)
    expect(sansRetour({ questionId: 'q3', score: 2, commentaire: 'Bien vu.' })).toBe(false)
  })
})

describe('appliquerNotes', () => {
  it('clôt la copie quand tout est noté', () => {
    const r = appliquerNotes(MIXTE, [
      { questionId: 'q3', score: 3, commentaire: 'Raisonnement juste.' },
      { questionId: 'q4', score: 0.5, commentaire: 'Incomplet.' },
    ])

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.valeur.statut).toBe('corrigee')
    expect(r.valeur.restantes).toEqual([])
    // 2 + 1,5 automatiques, 3 + 0,5 humaines.
    expect(r.valeur.score).toBe(7)
    expect(r.valeur.scoreMax).toBe(10)
  })

  it('laisse la copie en attente si une question reste à noter', () => {
    // Corriger trente copies se fait en plusieurs fois : une correction
    // partielle est un cas normal, pas une erreur.
    const r = appliquerNotes(MIXTE, [
      { questionId: 'q3', score: 3, commentaire: 'Raisonnement juste.' },
    ])

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.valeur.statut).toBe('attente_correction')
    expect(r.valeur.restantes).toEqual(['q4'])
    expect(r.valeur.score).toBe(6.5)
  })

  it('refuse une note hors barème plutôt que de l’écrêter', () => {
    // Écrêter donnerait 4/4 là où l'enseignant croit avoir mis 20 : l'écart
    // ne se verrait jamais.
    const r = appliquerNotes(MIXTE, [{ questionId: 'q3', score: 20, commentaire: '' }])

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erreur.code).toBe('donnees_invalides')
    expect(r.erreur.champs?.q3).toContain('entre 0 et 4')
  })

  it('refuse de renoter ce que la machine a déjà tranché', () => {
    // Ce n'est pas une correction mais une révision, et elle passe par une
    // nouvelle tentative.
    const r = appliquerNotes(MIXTE, [{ questionId: 'q1', score: 0, commentaire: 'Non.' }])

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erreur.champs?.q1).toContain('automatiquement')
  })

  it('refuse une question absente de la copie', () => {
    const r = appliquerNotes(MIXTE, [{ questionId: 'q9', score: 1, commentaire: '' }])
    expect(r.ok).toBe(false)
  })

  it('refuse de rouvrir une copie déjà corrigée', () => {
    // L'immuabilité d'une tentative corrigée est ce qui permet de répondre à
    // « pourquoi ai-je eu 12 ? ».
    const close = copie([{ questionId: 'q3', bareme: 4, score: 3 }], 'corrigee')
    const r = appliquerNotes(close, [{ questionId: 'q3', score: 4, commentaire: '' }])

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erreur.code).toBe('conflit')
    expect(r.erreur.message).toContain('révision')
  })

  it('n’invente pas de note pour une question non soumise à l’enseignant', () => {
    const r = appliquerNotes(MIXTE, [])
    expect(r.ok).toBe(true)
    if (!r.ok) return
    // Les deux rédigées restent à faire, et le total ne les compte pas.
    expect(r.valeur.restantes).toEqual(['q3', 'q4'])
    expect(r.valeur.score).toBe(3.5)
  })
})
