/**
 * Mise en forme PDF de la grille.
 *
 * Écrit à la main, comme le XLSX et le GLB : un PDF de tableaux ne demande
 * qu'une poignée d'objets et des flux non compressés. Une bibliothèque PDF
 * pèserait des méga-octets pour produire la même chose — et celle-ci se teste
 * octet par octet.
 *
 * Le destinataire est l'inspection : ce document doit se suffire. D'où le nom
 * de la classe en titre, la légende des niveaux en pied, et **jamais la
 * couleur seule** — les niveaux sont des lettres, pas des pastilles, pour la
 * même raison que la grille à l'écran a des symboles.
 */
import type { NiveauAcquisition } from './acquisition'
import { LIBELLES_NIVEAU } from './export-csv'
import { niveauDe, type Grille } from './suivi'

/** Abréviations tenant dans une cellule ; la légende donne le sens complet. */
export const ABREVIATIONS_NIVEAU: Record<NiveauAcquisition, string> = {
  non_abordee: '-',
  en_cours: 'EC',
  acquise: 'A',
  maitrisee: 'M',
}

// A4 paysage, en points.
const LARGEUR = 842
const HAUTEUR = 595
const MARGE = 40
const HAUTEUR_LIGNE = 16
const LARGEUR_COLONNE_ELEVE = 130
const LARGEUR_MINIMALE_COLONNE = 34

/**
 * WinAnsi (cp1252) couvre tout le français courant. Les rares caractères hors
 * page — un intitulé qui citerait du grec — deviennent « ? » plutôt que de
 * casser le document.
 */
const HORS_LATIN: ReadonlyMap<string, number> = new Map([
  ['€', 0x80],
  ['’', 0x92],
  ['‘', 0x91],
  ['“', 0x93],
  ['”', 0x94],
  ['–', 0x96],
  ['—', 0x97],
  ['œ', 0x9c],
  ['Œ', 0x8c],
])

function encoderWinAnsi(texte: string): Uint8Array {
  const octets = new Uint8Array(texte.length)
  for (let i = 0; i < texte.length; i++) {
    const code = texte.charCodeAt(i)
    octets[i] = code <= 0xff ? code : (HORS_LATIN.get(texte[i] as string) ?? 0x3f)
  }
  return octets
}

const echapper = (texte: string): string =>
  texte.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')

const texte = (x: number, y: number, police: string, taille: number, contenu: string) =>
  `BT /${police} ${taille} Tf ${x.toFixed(1)} ${y.toFixed(1)} Td (${echapper(contenu)}) Tj ET\n`

const trait = (x1: number, y1: number, x2: number, y2: number) =>
  `${x1.toFixed(1)} ${y1.toFixed(1)} m ${x2.toFixed(1)} ${y2.toFixed(1)} l S\n`

/** Tronque pour que le texte ne déborde pas de sa colonne. ~0,5 × taille par
 *  caractère : approximation large pour l'Helvetica, suffisante ici. */
function tronquer(contenu: string, largeur: number, taille: number): string {
  const maximum = Math.floor(largeur / (taille * 0.5))
  return contenu.length <= maximum ? contenu : `${contenu.slice(0, maximum - 1)}…`
}

type Page = { readonly flux: string }

function paginer(
  grille: Grille,
  index: ReadonlyMap<string, NiveauAcquisition>,
  nomClasse: string,
): readonly Page[] {
  const largeurUtile = LARGEUR - 2 * MARGE - LARGEUR_COLONNE_ELEVE
  const colonnesParPage = Math.max(
    1,
    Math.floor(largeurUtile / LARGEUR_MINIMALE_COLONNE),
  )

  const hautTableau = HAUTEUR - MARGE - 40
  const basTableau = MARGE + 30
  const lignesParPage = Math.max(
    1,
    Math.floor((hautTableau - basTableau) / HAUTEUR_LIGNE) - 1,
  )

  const groupesColonnes: (readonly (typeof grille.competences)[number][])[] = []
  for (let i = 0; i < grille.competences.length; i += colonnesParPage) {
    groupesColonnes.push(grille.competences.slice(i, i + colonnesParPage))
  }
  if (groupesColonnes.length === 0) groupesColonnes.push([])

  const pages: Page[] = []

  for (const colonnes of groupesColonnes) {
    const largeurColonne =
      colonnes.length > 0 ? largeurUtile / colonnes.length : largeurUtile

    for (let debut = 0; debut < Math.max(1, grille.apprenants.length); debut += lignesParPage) {
      const apprenants = grille.apprenants.slice(debut, debut + lignesParPage)
      let flux = ''

      flux += texte(MARGE, HAUTEUR - MARGE - 8, 'F2', 13, `Suivi de compétences — ${nomClasse}`)

      // En-tête : les codes seulement. Les intitulés complets rendraient
      // l'en-tête illisible ; ils sont dans le référentiel, pas ici.
      let y = hautTableau
      flux += '0.7 G 0.5 w\n'
      flux += trait(MARGE, y, LARGEUR - MARGE, y)
      colonnes.forEach((competence, rang) => {
        const x = MARGE + LARGEUR_COLONNE_ELEVE + rang * largeurColonne
        flux += texte(x + 2, y - 11, 'F2', 8, tronquer(competence.code, largeurColonne - 4, 8))
      })
      flux += texte(MARGE + 2, y - 11, 'F2', 8, 'Élève')
      y -= HAUTEUR_LIGNE
      flux += trait(MARGE, y, LARGEUR - MARGE, y)

      for (const apprenant of apprenants) {
        flux += texte(
          MARGE + 2,
          y - 11,
          'F1',
          9,
          tronquer(`${apprenant.prenom} ${apprenant.initialeNom}.`, LARGEUR_COLONNE_ELEVE - 4, 9),
        )
        colonnes.forEach((competence, rang) => {
          const x = MARGE + LARGEUR_COLONNE_ELEVE + rang * largeurColonne
          flux += texte(
            x + 2,
            y - 11,
            'F1',
            9,
            ABREVIATIONS_NIVEAU[niveauDe(index, apprenant.id, competence.id)],
          )
        })
        y -= HAUTEUR_LIGNE
        flux += trait(MARGE, y, LARGEUR - MARGE, y)
      }

      const legende = (Object.keys(ABREVIATIONS_NIVEAU) as NiveauAcquisition[])
        .map((niveau) => `${ABREVIATIONS_NIVEAU[niveau]} = ${LIBELLES_NIVEAU[niveau]}`)
        .join('    ')
      flux += texte(MARGE, MARGE, 'F1', 8, legende)

      pages.push({ flux })
    }
  }

  return pages
}

export const MIME_PDF = 'application/pdf'

export function grilleEnPdf(
  grille: Grille,
  index: ReadonlyMap<string, NiveauAcquisition>,
  nomClasse: string,
): Uint8Array {
  const pages = paginer(grille, index, nomClasse)

  // Objets : 1 catalogue, 2 pages, 3 police, 4 police grasse, puis pour
  // chaque page un objet page et un flux de contenu.
  const objets: string[] = []
  const numeroPage = (rang: number) => 5 + rang * 2

  objets.push('<< /Type /Catalog /Pages 2 0 R >>')
  objets.push(
    `<< /Type /Pages /Count ${pages.length} /Kids [${pages
      .map((_, rang) => `${numeroPage(rang)} 0 R`)
      .join(' ')}] >>`,
  )
  objets.push(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  )
  objets.push(
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
  )

  const flux: (Uint8Array | null)[] = [null, null, null, null]
  for (const [rang, page] of pages.entries()) {
    objets.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${LARGEUR} ${HAUTEUR}] ` +
        `/Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> ` +
        `/Contents ${numeroPage(rang) + 1} 0 R >>`,
    )
    flux.push(null)
    const contenu = encoderWinAnsi(page.flux)
    objets.push(`<< /Length ${contenu.length} >>`)
    flux.push(contenu)
  }

  // Assemblage avec table xref exacte : un lecteur strict la vérifie.
  const morceaux: Uint8Array[] = []
  const positions: number[] = []
  let position = 0
  const pousser = (octets: Uint8Array) => {
    morceaux.push(octets)
    position += octets.length
  }

  pousser(encoderWinAnsi('%PDF-1.4\n'))
  for (const [rang, objet] of objets.entries()) {
    positions.push(position)
    pousser(encoderWinAnsi(`${rang + 1} 0 obj\n${objet}\n`))
    const contenu = flux[rang]
    if (contenu) {
      pousser(encoderWinAnsi('stream\n'))
      pousser(contenu)
      pousser(encoderWinAnsi('\nendstream\n'))
    }
    pousser(encoderWinAnsi('endobj\n'))
  }

  const debutXref = position
  let xref = `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`
  for (const decalage of positions) {
    xref += `${decalage.toString().padStart(10, '0')} 00000 n \n`
  }
  pousser(
    encoderWinAnsi(
      `${xref}trailer\n<< /Size ${objets.length + 1} /Root 1 0 R >>\n` +
        `startxref\n${debutXref}\n%%EOF\n`,
    ),
  )

  const total = new Uint8Array(position)
  let curseur = 0
  for (const morceau of morceaux) {
    total.set(morceau, curseur)
    curseur += morceau.length
  }
  return total
}
