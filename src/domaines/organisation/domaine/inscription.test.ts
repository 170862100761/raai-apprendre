import { describe, expect, it } from 'vitest'
import {
  analyserImport,
  codeDeRattachement,
  identifiantDeConnexion,
} from './inscription'

describe('analyse d’une liste collée', () => {
  it('accepte les séparateurs qu’un tableur produit', () => {
    for (const texte of ['Léa;M', 'Léa,M', 'Léa\tM', 'Léa   M']) {
      const { retenus } = analyserImport(texte)
      expect(retenus, texte).toEqual([{ prenom: 'Léa', initialeNom: 'M' }])
    }
  })

  it('accepte une ligne sans initiale', () => {
    // Beaucoup d'établissements ne l'ont pas au moment de créer la classe.
    // Bloquer pour cela ferait renoncer.
    expect(analyserImport('Thomas').retenus).toEqual([{ prenom: 'Thomas', initialeNom: '' }])
  })

  it('remet les prénoms en forme : les listes arrivent en majuscules', () => {
    const { retenus } = analyserImport('JEAN-LUC;D\nMARIE claire;B')
    expect(retenus.map((r) => r.prenom)).toEqual(['Jean-Luc', 'Marie Claire'])
  })

  it('ne garde que la première lettre du nom, jamais le nom entier', () => {
    // Ce sont des mineurs : la donnée qu'on ne collecte pas ne peut pas fuir.
    const { retenus } = analyserImport('Léa;Marchand')
    expect(retenus[0]?.initialeNom).toBe('M')
  })

  it('ignore les colonnes en trop et le dit', () => {
    const analyse = analyserImport('Léa;M;12/03/2009;lea@exemple.fr')
    expect(analyse.retenus).toEqual([{ prenom: 'Léa', initialeNom: 'M' }])
    // Date de naissance et e-mail sont écartés — et l'utilisateur est prévenu
    // plutôt que de croire qu'ils ont été enregistrés.
    expect(analyse.colonnesIgnorees).toBe(2)
  })

  it('signale les doublons au lieu de créer deux comptes indistinguables', () => {
    const analyse = analyserImport('Léa;M\nThomas;B\nLéa;M')
    expect(analyse.retenus).toHaveLength(2)
    expect(analyse.rejetes).toHaveLength(1)
    expect(analyse.rejetes[0]?.motif).toMatch(/[Dd]oublon/)
    expect(analyse.rejetes[0]?.ligne).toBe(3)
  })

  it('distingue deux prénoms identiques avec des initiales différentes', () => {
    expect(analyserImport('Léa;M\nLéa;K').retenus).toHaveLength(2)
  })

  it('rejette ce qui n’est pas un prénom, en donnant le numéro de ligne', () => {
    const analyse = analyserImport('Léa;M\n42;X\n<script>;Y')
    expect(analyse.retenus).toHaveLength(1)
    expect(analyse.rejetes.map((r) => r.ligne)).toEqual([2, 3])
  })

  it('ignore les lignes vides sans les compter comme des rejets', () => {
    const analyse = analyserImport('Léa;M\n\n\nThomas;B\n')
    expect(analyse.retenus).toHaveLength(2)
    expect(analyse.rejetes).toEqual([])
  })
})

describe('identifiant de connexion', () => {
  it('se lit à voix haute et se recopie sans accent', () => {
    // Il est dicté par un formateur et tapé par un élève de seize ans.
    expect(identifiantDeConnexion('Léa', '0820001A', new Set())).toBe('lea.0820001a')
    expect(identifiantDeConnexion("Jean-Luc", '0820001A', new Set())).toBe('jeanluc.0820001a')
  })

  it('suffixe en cas de collision, sans révéler le nom de famille', () => {
    const pris = new Set(['lea.0820001a'])
    expect(identifiantDeConnexion('Léa', '0820001A', pris)).toBe('lea2.0820001a')

    pris.add('lea2.0820001a')
    expect(identifiantDeConnexion('Léa', '0820001A', pris)).toBe('lea3.0820001a')
  })

  it('finit par renoncer plutôt que de boucler', () => {
    const pris = new Set(['lea.0820001a'])
    for (let n = 2; n < 100; n++) pris.add(`lea${n}.0820001a`)
    expect(() => identifiantDeConnexion('Léa', '0820001A', pris)).toThrow()
  })
})

describe('code de rattachement', () => {
  const suite = (valeurs: number[]) => {
    let i = 0
    return () => valeurs[i++ % valeurs.length]!
  }

  it('reprend le nom de la classe et l’année', () => {
    expect(codeDeRattachement('TAE 2026', '2026', suite([0]))).toBe('TAE2-2026-AAAA')
  })

  it('évite les caractères qui se confondent', () => {
    // Ni O/0 ni I/1/L : un code mal recopié, c'est dix minutes de cours
    // perdues.
    const code = codeDeRattachement('Terminale', '2026', suite([0.5, 0.9, 0.1, 0.3]))
    const suffixe = code.split('-')[2]!
    expect(suffixe).not.toMatch(/[OIL01]/)
  })

  it('tient debout avec un nom de classe non alphabétique', () => {
    expect(codeDeRattachement('  ', '2026', suite([0]))).toBe('CLAS-2026-AAAA')
  })
})
