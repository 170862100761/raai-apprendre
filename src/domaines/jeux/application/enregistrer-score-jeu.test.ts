import { describe, expect, it } from 'vitest'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantApprenant, IdentifiantCompetence } from '@/noyau/identifiants'
import type { DepotProgression, EcritureAcquis } from '@/domaines/progression'
import type { DepotScores, ScoreAEnregistrer } from '../ports/depot-scores'
import { enregistrerScoreJeu } from './enregistrer-score-jeu'

const LEA = identifiant<IdentifiantApprenant>('00000000-0000-4000-8000-000000000040')
const C5 = identifiant<IdentifiantCompetence>('00000000-0000-4000-8000-000000000005')
const C5_1 = identifiant<IdentifiantCompetence>('00000000-0000-4000-8000-000000000051')
const C7 = identifiant<IdentifiantCompetence>('00000000-0000-4000-8000-000000000007')

function harnais(dejaAcquise = false) {
  const scores: ScoreAEnregistrer[] = []
  const acquis: EcritureAcquis[] = []

  const depotScores: DepotScores = {
    async enregistrer(s) {
      scores.push(s)
      return { id: `score-${scores.length}` }
    },
    async meilleurs() {
      return new Map()
    },
    async competencesPourCodes() {
      return [
        { id: C5, code: 'C5', parentId: null },
        { id: C5_1, code: 'C5.1', parentId: C5 },
        { id: C7, code: 'C7', parentId: null },
      ]
    },
  }

  const depotProgression: DepotProgression = {
    async lireAcquis() {
      return dejaAcquise
        ? new Map([[C5_1, { niveau: 'acquise' as const, constateLe: new Date('2026-09-01') }]])
        : new Map()
    },
    async ecrireAcquis(e) {
      acquis.push(...e)
    },
    async lireGrilleClasse() {
      return null
    },
  }

  return { scores, acquis, depots: { scores: depotScores, progression: depotProgression } }
}

const partie = (score: number, scoreMax = 10) => ({
  apprenantId: LEA,
  etablissementId: 'etab-a',
  jeu: 'quiz-hydraulique-tracteur',
  capacites: ['C5.1', 'C7.2'],
  score,
  scoreMax,
  joueLe: new Date('2026-09-04T10:00:00Z'),
})

describe('enregistrer un score de jeu', () => {
  it('garde toujours la partie, même ratée', async () => {
    const h = harnais()
    const r = await enregistrerScoreJeu(partie(3), h.depots)

    expect(r.ok).toBe(true)
    expect(h.scores).toHaveLength(1)
    expect(h.scores[0]?.part).toBe(0.3)
    expect(h.acquis).toEqual([])
  })

  it('ne touche pas la progression sous 0,8', async () => {
    const h = harnais()
    const r = await enregistrerScoreJeu(partie(7), h.depots)

    expect(r.ok && r.valeur.evolutions).toEqual([])
    expect(h.acquis).toEqual([])
  })

  it('à 0,8, compte comme un résultat d’évaluation sur les capacités résolues', async () => {
    const h = harnais()
    const r = await enregistrerScoreJeu(partie(8), h.depots)

    expect(r.ok).toBe(true)
    // C5.1 existe telle quelle ; C7.2 retombe sur C7.
    expect(h.acquis.map((a) => a.competenceId)).toEqual([C5_1, C7])
    expect(h.acquis.every((a) => a.niveau === 'acquise')).toBe(true)
    expect(h.acquis.every((a) => a.origine === 'evaluation')).toBe(true)
    // La source est la ligne de score, pas une chaîne libre.
    expect(h.acquis.every((a) => a.sourceId === 'score-1')).toBe(true)
  })

  it('ne fait pas redescendre un acquis — la règle vit dans progression', async () => {
    const h = harnais(true)
    await enregistrerScoreJeu(partie(9), h.depots)

    // Déjà acquise trois jours plus tôt : rien ne change, rien ne s'écrit pour C5.1.
    expect(h.acquis.map((a) => a.competenceId)).toEqual([C7])
  })

  it('refuse un score illisible sans rien écrire', async () => {
    const h = harnais()
    const r = await enregistrerScoreJeu(partie(5, 0), h.depots)

    expect(r.ok).toBe(false)
    expect(h.scores).toEqual([])
  })
})
