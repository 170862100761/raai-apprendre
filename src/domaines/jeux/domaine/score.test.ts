import { describe, expect, it } from 'vitest'
import {
  calculerPart,
  comptePourLaProgression,
  resoudreCapacites,
  SEUIL_PROGRESSION,
} from './score'

describe('part d’une partie', () => {
  it('rapporte le score au maximum', () => {
    expect(calculerPart({ score: 8, scoreMax: 10 })).toBe(0.8)
  })

  it('reste entre 0 et 1 quoi qu’envoie le navigateur', () => {
    expect(calculerPart({ score: 12, scoreMax: 10 })).toBe(1)
    expect(calculerPart({ score: -3, scoreMax: 10 })).toBe(0)
    expect(calculerPart({ score: 5, scoreMax: 0 })).toBe(0)
    expect(calculerPart({ score: 5, scoreMax: Number.NaN })).toBe(0)
  })

  it('ne compte pour la progression qu’à partir de 0,8', () => {
    expect(SEUIL_PROGRESSION).toBe(0.8)
    expect(comptePourLaProgression(0.8)).toBe(true)
    expect(comptePourLaProgression(0.79)).toBe(false)
    expect(comptePourLaProgression(1)).toBe(true)
  })
})

describe('résolution des capacités', () => {
  const connues = [
    { id: 'c5', code: 'C5', parentId: null },
    { id: 'c5-1', code: 'C5.1', parentId: 'c5' },
    { id: 'c7', code: 'C7', parentId: null },
  ]

  it('prend le code exact quand il existe', () => {
    expect(resoudreCapacites(['C5.1'], connues)).toEqual(['c5-1'])
  })

  it('retombe sur la capacité de rang 1 quand la sous-capacité est inconnue', () => {
    expect(resoudreCapacites(['C7.2'], connues)).toEqual(['c7'])
  })

  it('ignore un code qui ne correspond à rien', () => {
    expect(resoudreCapacites(['C9.1', 'X'], connues)).toEqual([])
  })

  it('ne renvoie pas deux fois la même compétence', () => {
    expect(resoudreCapacites(['C7.1', 'C7.2', 'C7'], connues)).toEqual(['c7'])
  })

  it('garde l’ordre des codes du jeu', () => {
    expect(resoudreCapacites(['C7.1', 'C5.1'], connues)).toEqual(['c7', 'c5-1'])
  })
})
