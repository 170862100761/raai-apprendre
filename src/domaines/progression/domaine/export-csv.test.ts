import { describe, expect, it } from 'vitest'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantApprenant, IdentifiantCompetence } from '@/noyau/identifiants'
import { BOM, echapperCellule, grilleEnCsv, nomFichierSur } from './export-csv'
import { indexer, type Grille } from './suivi'

const grille: Grille = {
  apprenants: [
    {
      id: identifiant<IdentifiantApprenant>('lea'),
      prenom: 'Léa',
      initialeNom: 'M',
      vuLe: null,
    },
  ],
  competences: [
    {
      id: identifiant<IdentifiantCompetence>('C5'),
      code: 'C5',
      intitule: 'Choisir un équipement adapté',
    },
    {
      id: identifiant<IdentifiantCompetence>('C6'),
      code: 'C6',
      intitule: 'Organiser un chantier',
    },
  ],
  cellules: [
    {
      apprenantId: identifiant<IdentifiantApprenant>('lea'),
      competenceId: identifiant<IdentifiantCompetence>('C5'),
      niveau: 'maitrisee',
    },
  ],
}

describe('échappement d’une cellule', () => {
  it('entoure de guillemets et double ceux du contenu', () => {
    expect(echapperCellule('simple')).toBe('"simple"')
    expect(echapperCellule('avec "guillemets"')).toBe('"avec ""guillemets"""')
  })

  it('protège le point-virgule, qui est notre séparateur', () => {
    expect(echapperCellule('a;b')).toBe('"a;b"')
  })

  it('neutralise une formule', () => {
    // Un intitulé commençant par « = » s'exécuterait à l'ouverture dans Excel.
    // Ce n'est pas théorique : les référentiels contiennent des signes.
    expect(echapperCellule('=1+1')).toBe(`"'=1+1"`)
    for (const debut of ['+', '-', '@']) {
      expect(echapperCellule(`${debut}SOMME(A1)`), debut).toContain("'")
    }
  })

  it('laisse tranquille un texte normal contenant un tiret', () => {
    // Le tiret ne pose problème qu'en TÊTE de cellule.
    expect(echapperCellule('Bac Pro Agro-équipement')).toBe('"Bac Pro Agro-équipement"')
  })
})

describe('grille en CSV', () => {
  const csv = grilleEnCsv(grille, indexer(grille))

  it('commence par la BOM, sinon les accents sont illisibles dans Excel', () => {
    expect(csv.startsWith(BOM)).toBe(true)
  })

  it('sépare par des points-virgules', () => {
    // Avec une virgule, tout atterrirait dans la colonne A d'un Excel français.
    expect(csv).toContain('"Élève";"C5 Choisir un équipement adapté"')
  })

  it('termine les lignes en CRLF', () => {
    expect(csv).toContain('\r\n')
  })

  it('écrit les niveaux en toutes lettres', () => {
    expect(csv).toContain('"Maîtrisée"')
    // Une case vide n'est pas vide : elle vaut « non abordée ».
    expect(csv).toContain('"Non abordée"')
  })

  it('produit autant de lignes que d’élèves, plus l’entête', () => {
    expect(csv.split('\r\n')).toHaveLength(2)
  })
})

describe('nom de fichier', () => {
  it('retire accents et espaces — il traverse un en-tête HTTP', () => {
    expect(nomFichierSur('TAE 2026 — Terminale')).toBe('tae-2026-terminale')
  })
})
