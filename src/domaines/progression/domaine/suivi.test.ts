import { describe, expect, it } from 'vitest'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantApprenant, IdentifiantCompetence } from '@/noyau/identifiants'
import {
  avancement,
  competencesEnDifficulte,
  couvertureReferentiel,
  indexer,
  jamaisConnectes,
  niveauDe,
  sansConnexionRecente,
  type Grille,
} from './suivi'
import type { NiveauAcquisition } from './acquisition'

const eleve = (n: string, vuLe: Date | null = new Date('2026-09-20T10:00:00Z')) => ({
  id: identifiant<IdentifiantApprenant>(n),
  prenom: n,
  initialeNom: n[0]!.toUpperCase(),
  vuLe,
})

const competence = (code: string) => ({
  id: identifiant<IdentifiantCompetence>(code),
  code,
  intitule: `Intitulé ${code}`,
})

const cellule = (a: string, c: string, niveau: NiveauAcquisition) => ({
  apprenantId: identifiant<IdentifiantApprenant>(a),
  competenceId: identifiant<IdentifiantCompetence>(c),
  niveau,
})

const grille: Grille = {
  apprenants: [eleve('lea'), eleve('thomas'), eleve('ines')],
  competences: [competence('C5'), competence('C6'), competence('C7'), competence('C8')],
  cellules: [
    cellule('lea', 'C5', 'maitrisee'),
    cellule('lea', 'C6', 'acquise'),
    cellule('lea', 'C7', 'en_cours'),
    cellule('thomas', 'C5', 'acquise'),
    cellule('thomas', 'C6', 'en_cours'),
    cellule('ines', 'C5', 'en_cours'),
  ],
}

const index = indexer(grille)

describe('lecture d’une cellule', () => {
  it('rend le niveau enregistré', () => {
    expect(niveauDe(index, identifiant('lea'), identifiant('C5'))).toBe('maitrisee')
  })

  it("rend « non abordée » pour une case vide, pas undefined", () => {
    // Une case vide veut dire quelque chose : la compétence n'a pas été
    // travaillée. Ce n'est pas une absence de donnée.
    expect(niveauDe(index, identifiant('ines'), identifiant('C8'))).toBe('non_abordee')
  })
})

describe('avancement d’un élève', () => {
  it('ne compte que ce qui est validé', () => {
    // Léa : C5 maîtrisée + C6 acquise = 2 sur 4.
    expect(avancement(grille, index, identifiant('lea'))).toBe(0.5)
    // Thomas : seule C5 est acquise ; « en cours » ne compte pas.
    expect(avancement(grille, index, identifiant('thomas'))).toBe(0.25)
    expect(avancement(grille, index, identifiant('ines'))).toBe(0)
  })

  it('ne divise pas par zéro sans compétence', () => {
    const vide: Grille = { ...grille, competences: [] }
    expect(avancement(vide, indexer(vide), identifiant('lea'))).toBe(0)
  })
})

describe('compétences en difficulté', () => {
  it('désigne les colonnes qui coincent, de la pire à la moins pire', () => {
    // Un enseignant n'a pas le temps de lire 24 × 10 cases.
    const bloquantes = competencesEnDifficulte(grille, index)
    expect(bloquantes.map((b) => b.competence.code)).toEqual(['C7', 'C8', 'C6'])
    expect(bloquantes[0]?.partValidee).toBe(0)
  })

  it('écarte les compétences majoritairement validées', () => {
    // C5 : 2 élèves sur 3 l'ont validée.
    expect(competencesEnDifficulte(grille, index).map((b) => b.competence.code)).not.toContain(
      'C5',
    )
  })

  it('ne signale rien sur une classe vide', () => {
    const vide: Grille = { ...grille, apprenants: [] }
    expect(competencesEnDifficulte(vide, indexer(vide))).toEqual([])
  })
})

describe('couverture du référentiel', () => {
  it("mesure ce qui a été abordé, pas la réussite", () => {
    // C5, C6, C7 ont été touchées ; C8 non. Une colonne vide signale un
    // chapitre non traité, pas une classe faible.
    expect(couvertureReferentiel(grille, index)).toBe(0.75)
  })

  it('vaut zéro quand rien n’a été travaillé', () => {
    const neuve: Grille = { ...grille, cellules: [] }
    expect(couvertureReferentiel(neuve, indexer(neuve))).toBe(0)
  })
})

describe('signalement d’inactivité', () => {
  const maintenant = new Date('2026-10-01T10:00:00Z')

  it('signale au-delà de quatorze jours', () => {
    const eleves = [
      eleve('recent', new Date('2026-09-28T10:00:00Z')),
      eleve('absent', new Date('2026-09-10T10:00:00Z')),
    ]
    expect(sansConnexionRecente(eleves, maintenant).map((e) => e.prenom)).toEqual(['absent'])
  })

  it("ne signale pas un élève qui ne s'est jamais connecté", () => {
    // C'est un compte distribué mais jamais utilisé : cela relève de la mise
    // en route de la classe, pas du décrochage.
    const eleves = [eleve('jamais', null)]
    expect(sansConnexionRecente(eleves, maintenant)).toEqual([])
    expect(jamaisConnectes(eleves).map((e) => e.prenom)).toEqual(['jamais'])
  })

  it('accepte un autre seuil', () => {
    const eleves = [eleve('absent', new Date('2026-09-25T10:00:00Z'))]
    expect(sansConnexionRecente(eleves, maintenant, 30)).toEqual([])
    expect(sansConnexionRecente(eleves, maintenant, 3)).toHaveLength(1)
  })
})
