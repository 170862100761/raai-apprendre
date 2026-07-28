import { describe, expect, it } from 'vitest'
import { chercher, normaliser, score, termes, LONGUEUR_MINIMALE } from './recherche'

const lecon = (titre: string, chapitre = 'Hydraulique des équipements') => ({ titre, chapitre })

const CATALOGUE = [
  lecon('Attelage en sécurité : les gestes qui évitent les accidents', 'Sécurité'),
  lecon('Débit, pression et puissance hydraulique'),
  lecon('Motorisation des tracteurs', 'Moteurs'),
  lecon('Le moteur diesel', 'Moteurs'),
]

describe('normalisation', () => {
  it('ignore les accents', () => {
    expect(normaliser('Sécurité')).toBe('securite')
    expect(normaliser('à côté')).toBe('a cote')
  })

  it('décompose les ligatures, que NFD laisse intactes', () => {
    expect(normaliser('cœur')).toBe('coeur')
    expect(normaliser('Ça')).toBe('ca')
  })

  it('trouve « mise en œuvre » tapé « mise en oeuvre »', () => {
    // Cas réel : c'est le nom d'un chapitre du jeu de démonstration.
    expect(normaliser('Sécurité à la mise en œuvre')).toBe('securite a la mise en oeuvre')
  })

  it('réduit la ponctuation à des espaces', () => {
    expect(normaliser('Débit, pression : puissance')).toBe('debit pression puissance')
  })
})

describe('découpage en termes', () => {
  it('écarte les termes trop courts sans écarter la recherche', () => {
    expect(termes('TP moteur')).toEqual(['tp', 'moteur'])
    expect(termes('a moteur')).toEqual(['moteur'])
  })

  it('retient les sigles courts, légitimes en enseignement technique', () => {
    expect(LONGUEUR_MINIMALE).toBe(2)
    expect(termes('3D')).toEqual(['3d'])
  })

  it('ne renvoie rien sur une saisie vide ou inexploitable', () => {
    expect(termes('   ')).toEqual([])
    expect(termes('a')).toEqual([])
  })
})

describe('score', () => {
  it('exige que TOUS les termes correspondent', () => {
    const sujet = lecon('Attelage en sécurité', 'Sécurité')
    expect(score(sujet, ['attelage', 'securite'])).toBeGreaterThan(0)
    expect(score(sujet, ['attelage', 'hydraulique'])).toBe(0)
  })

  it('place le titre au-dessus du chapitre', () => {
    const dansLeTitre = score(lecon('Moteur diesel', 'Sécurité'), ['moteur'])
    const dansLeChapitre = score(lecon('Attelage', 'Moteurs'), ['moteur'])
    expect(dansLeTitre).toBeGreaterThan(dansLeChapitre)
  })

  it('place un mot entier au-dessus d’un fragment', () => {
    const entier = score(lecon('Le moteur diesel', 'Moteurs'), ['moteur'])
    const fragment = score(lecon('Motorisation des tracteurs', 'Moteurs'), ['motor'])
    expect(entier).toBeGreaterThan(fragment)
  })

  it('ne trouve rien sans terme', () => {
    expect(score(lecon('Moteur'), [])).toBe(0)
  })
})

describe('recherche', () => {
  it('trouve malgré les accents manquants', () => {
    const trouves = chercher(CATALOGUE, 'securite')
    expect(trouves).toHaveLength(1)
    expect(trouves[0]?.sujet.titre).toContain('Attelage')
  })

  it('trouve malgré les accents en trop', () => {
    expect(chercher(CATALOGUE, 'sécurité')).toHaveLength(1)
  })

  it('classe le titre exact avant le voisin', () => {
    const trouves = chercher(CATALOGUE, 'moteur')
    expect(trouves[0]?.sujet.titre).toBe('Le moteur diesel')
  })

  it('n’affiche pas le catalogue entier sur une saisie inexploitable', () => {
    // Le piège : rendre « tout » sur une recherche vide donne l'illusion d'un
    // résultat. Mieux vaut zéro ligne et un message clair.
    expect(chercher(CATALOGUE, '')).toEqual([])
    expect(chercher(CATALOGUE, 'a')).toEqual([])
  })

  it('ne rend rien quand rien ne correspond', () => {
    expect(chercher(CATALOGUE, 'comptabilite')).toEqual([])
  })

  it('respecte la limite demandée', () => {
    expect(chercher(CATALOGUE, 'e', 2)).toEqual([])
    expect(chercher(CATALOGUE, 'moteur', 1)).toHaveLength(1)
  })

  it('classe de façon stable à score égal', () => {
    const egaux = [lecon('Zed', 'Moteurs'), lecon('Alpha', 'Moteurs')]
    expect(chercher(egaux, 'moteurs').map((r) => r.sujet.titre)).toEqual(['Alpha', 'Zed'])
  })
})
