import { describe, expect, it } from 'vitest'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantApprenant, IdentifiantCompetence } from '@/noyau/identifiants'
import { indexer, type Grille } from './suivi'
import { crc32, grilleEnXlsx, zipStocke } from './export-xlsx'
import { ABREVIATIONS_NIVEAU, grilleEnPdf } from './export-pdf'

const apprenant = (id: string, prenom: string) => ({
  id: identifiant<IdentifiantApprenant>(id),
  prenom,
  initialeNom: 'M',
  vuLe: null,
})

const competence = (id: string, code: string) => ({
  id: identifiant<IdentifiantCompetence>(id),
  code,
  intitule: `Intitulé ${code}`,
})

const GRILLE: Grille = {
  apprenants: [apprenant('a1', 'Léa'), apprenant('a2', 'Thomas')],
  competences: [competence('c1', 'C1.1'), competence('c2', 'C2.1')],
  cellules: [
    {
      apprenantId: identifiant<IdentifiantApprenant>('a1'),
      competenceId: identifiant<IdentifiantCompetence>('c1'),
      niveau: 'maitrisee',
    },
  ],
}

const decodeur = new TextDecoder()

describe('zipStocke', () => {
  it('produit un ZIP valide : signatures locale, centrale et de fin', () => {
    const zip = zipStocke([{ chemin: 'a.txt', contenu: new TextEncoder().encode('bonjour') }])
    const vue = new DataView(zip.buffer)
    expect(vue.getUint32(0, true)).toBe(0x04034b50)
    expect(vue.getUint32(zip.length - 22, true)).toBe(0x06054b50)
  })

  it('est déterministe : deux appels, mêmes octets', () => {
    const entree = [{ chemin: 'a', contenu: new Uint8Array([1, 2, 3]) }]
    expect(zipStocke(entree)).toEqual(zipStocke(entree))
  })

  it('calcule le CRC32 de référence', () => {
    // Valeur connue pour « 123456789 » — le vecteur de test du standard.
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926)
  })
})

describe('grilleEnXlsx', () => {
  const xlsx = grilleEnXlsx(GRILLE, indexer(GRILLE))
  const contenu = decodeur.decode(xlsx)

  it('contient les cinq fichiers du paquet OOXML', () => {
    for (const chemin of [
      '[Content_Types].xml',
      '_rels/.rels',
      'xl/workbook.xml',
      'xl/_rels/workbook.xml.rels',
      'xl/worksheets/sheet1.xml',
    ]) {
      expect(contenu).toContain(chemin)
    }
  })

  it('porte les élèves et les niveaux en chaînes en ligne', () => {
    expect(contenu).toContain('Léa M.')
    expect(contenu).toContain('Maîtrisée')
    expect(contenu).toContain('Non abordée')
  })

  it('échappe le XML : un intitulé avec « < » ne casse pas la feuille', () => {
    const piegee: Grille = {
      ...GRILLE,
      competences: [{ ...competence('c1', 'C1.1'), intitule: 'a < b & c' }],
    }
    const texte = decodeur.decode(grilleEnXlsx(piegee, indexer(piegee)))
    expect(texte).toContain('a &lt; b &amp; c')
    expect(texte).not.toContain('a < b')
  })
})

describe('grilleEnPdf', () => {
  const pdf = grilleEnPdf(GRILLE, indexer(GRILLE), 'Terminale A')
  const contenu = new TextDecoder('latin1').decode(pdf)

  it('commence par l’en-tête PDF et finit par %%EOF', () => {
    expect(contenu.startsWith('%PDF-1.4')).toBe(true)
    expect(contenu.trimEnd().endsWith('%%EOF')).toBe(true)
  })

  it('porte le nom de la classe, les élèves et la légende', () => {
    expect(contenu).toContain('Terminale A')
    expect(contenu).toContain('Thomas M.')
    expect(contenu).toContain(`${ABREVIATIONS_NIVEAU.maitrisee} = `)
  })

  it('échappe les parenthèses : un prénom entre parenthèses ne casse pas le flux', () => {
    const piegee: Grille = { ...GRILLE, apprenants: [apprenant('a1', 'Léa (redoublante)')] }
    const texte = new TextDecoder('latin1').decode(
      grilleEnPdf(piegee, indexer(piegee), 'B'),
    )
    expect(texte).toContain('Léa \\(redoublante\\)')
  })

  it('pagine : soixante élèves tiennent sur plusieurs pages', () => {
    const nombreux: Grille = {
      ...GRILLE,
      apprenants: Array.from({ length: 60 }, (_, i) => apprenant(`a${i}`, `Prenom${i}`)),
    }
    const texte = new TextDecoder('latin1').decode(
      grilleEnPdf(nombreux, indexer(nombreux), 'B'),
    )
    const pages = texte.match(/\/Type \/Page /g) ?? []
    expect(pages.length).toBeGreaterThan(1)
    // Personne ne tombe entre deux pages.
    expect(texte).toContain('Prenom59')
  })
})
