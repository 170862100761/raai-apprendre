/**
 * Mise en forme XLSX de la grille.
 *
 * Écrit à la main, sans bibliothèque — comme le GLB de la médiathèque. Un
 * `.xlsx` n'est qu'un ZIP de petits fichiers XML, et un ZIP **sans
 * compression** s'écrit en cent lignes déterministes et testables. Le fichier
 * est plus gros qu'avec compression, mais une grille de classe pèse quelques
 * kilo-octets : la dépendance coûterait plus cher que les octets.
 *
 * Les textes sont en « inline strings » : pas de table de chaînes partagée,
 * donc pas d'état à maintenir entre les cellules.
 */
import type { NiveauAcquisition } from './acquisition'
import { LIBELLES_NIVEAU } from './export-csv'
import { niveauDe, type Grille } from './suivi'

const encodeur = new TextEncoder()

function echapperXml(texte: string): string {
  return texte
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// --- ZIP sans compression --------------------------------------------------

const TABLE_CRC = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

export function crc32(octets: Uint8Array): number {
  let crc = 0xffffffff
  for (const octet of octets) {
    crc = (TABLE_CRC[(crc ^ octet) & 0xff] as number) ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

type Entree = { readonly chemin: string; readonly contenu: Uint8Array }

/** Assemble un ZIP en mode « stocké ». Horodatage à zéro : deux exports du
 *  même contenu donnent le même fichier, ce qui rend les tests exacts. */
export function zipStocke(entrees: readonly Entree[]): Uint8Array {
  const morceaux: Uint8Array[] = []
  const centraux: Uint8Array[] = []
  let position = 0

  for (const { chemin, contenu } of entrees) {
    const nom = encodeur.encode(chemin)
    const crc = crc32(contenu)

    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true)
    local.setUint16(4, 20, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, contenu.length, true)
    local.setUint32(22, contenu.length, true)
    local.setUint16(26, nom.length, true)
    morceaux.push(new Uint8Array(local.buffer), nom, contenu)

    const central = new DataView(new ArrayBuffer(46))
    central.setUint32(0, 0x02014b50, true)
    central.setUint16(4, 20, true)
    central.setUint16(6, 20, true)
    central.setUint32(16, crc, true)
    central.setUint32(20, contenu.length, true)
    central.setUint32(24, contenu.length, true)
    central.setUint16(28, nom.length, true)
    central.setUint32(42, position, true)
    centraux.push(new Uint8Array(central.buffer), nom)

    position += 30 + nom.length + contenu.length
  }

  const tailleCentral = centraux.reduce((total, m) => total + m.length, 0)
  const fin = new DataView(new ArrayBuffer(22))
  fin.setUint32(0, 0x06054b50, true)
  fin.setUint16(8, entrees.length, true)
  fin.setUint16(10, entrees.length, true)
  fin.setUint32(12, tailleCentral, true)
  fin.setUint32(16, position, true)

  const total = position + tailleCentral + 22
  const zip = new Uint8Array(total)
  let curseur = 0
  for (const morceau of [...morceaux, ...centraux, new Uint8Array(fin.buffer)]) {
    zip.set(morceau, curseur)
    curseur += morceau.length
  }
  return zip
}

// --- Feuille ---------------------------------------------------------------

const cellule = (texte: string): string =>
  `<c t="inlineStr"><is><t>${echapperXml(texte)}</t></is></c>`

function feuille(grille: Grille, index: ReadonlyMap<string, NiveauAcquisition>): string {
  const lignes = [
    ['Élève', ...grille.competences.map((c) => `${c.code} ${c.intitule}`)],
    ...grille.apprenants.map((apprenant) => [
      `${apprenant.prenom} ${apprenant.initialeNom}.`,
      ...grille.competences.map(
        (competence) => LIBELLES_NIVEAU[niveauDe(index, apprenant.id, competence.id)],
      ),
    ]),
  ]

  const corps = lignes
    .map((ligne) => `<row>${ligne.map(cellule).join('')}</row>`)
    .join('')

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${corps}</sheetData></worksheet>`
  )
}

const TYPES_DE_CONTENU =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
  '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
  '</Types>'

const RELATIONS_RACINE =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
  '</Relationships>'

const CLASSEUR =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  '<sheets><sheet name="Suivi" sheetId="1" r:id="rId1"/></sheets></workbook>'

const RELATIONS_CLASSEUR =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
  '</Relationships>'

export const MIME_XLSX =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export function grilleEnXlsx(
  grille: Grille,
  index: ReadonlyMap<string, NiveauAcquisition>,
): Uint8Array {
  return zipStocke([
    { chemin: '[Content_Types].xml', contenu: encodeur.encode(TYPES_DE_CONTENU) },
    { chemin: '_rels/.rels', contenu: encodeur.encode(RELATIONS_RACINE) },
    { chemin: 'xl/workbook.xml', contenu: encodeur.encode(CLASSEUR) },
    { chemin: 'xl/_rels/workbook.xml.rels', contenu: encodeur.encode(RELATIONS_CLASSEUR) },
    { chemin: 'xl/worksheets/sheet1.xml', contenu: encodeur.encode(feuille(grille, index)) },
  ])
}
