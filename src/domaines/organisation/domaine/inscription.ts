/**
 * Mise en route d'une classe : identifiants, codes, import de la liste.
 *
 * Tout part d'une contrainte : **on ne collecte que le prénom et l'initiale du
 * nom.** Ce sont des mineurs. Un import qui accepterait un nom complet, une
 * date de naissance ou un e-mail créerait une base de données personnelles que
 * personne n'a demandée et que l'établissement devrait ensuite justifier.
 *
 * L'écran d'import reçoit donc une liste collée depuis un tableur, et
 * n'en garde que ce dont la plateforme a besoin.
 */

export type EleveAInscrire = {
  readonly prenom: string
  readonly initialeNom: string
}

export type LigneRejetee = {
  readonly ligne: number
  readonly contenu: string
  readonly motif: string
}

export type AnalyseImport = {
  readonly retenus: readonly EleveAInscrire[]
  readonly rejetes: readonly LigneRejetee[]
  /** Colonnes ignorées volontairement, à montrer pour rassurer l'utilisateur. */
  readonly colonnesIgnorees: number
}

const PRENOM_VALIDE = /^[\p{L}][\p{L}\-' ]{0,39}$/u

/**
 * Analyse une liste collée depuis un tableur.
 *
 * Formats acceptés, dans cet ordre de préférence :
 *   Léa;M          Léa,M          Léa   M          Léa
 *
 * Une ligne sans initiale est acceptée : beaucoup d'établissements ne
 * l'ont pas sous la main au moment de créer la classe, et bloquer l'import
 * pour cela ferait renoncer.
 */
export function analyserImport(texte: string): AnalyseImport {
  const retenus: EleveAInscrire[] = []
  const rejetes: LigneRejetee[] = []
  const vus = new Set<string>()
  let colonnesIgnorees = 0

  const lignes = texte.split(/\r?\n/)

  for (const [i, brute] of lignes.entries()) {
    const contenu = brute.trim()
    if (contenu === '') continue

    const colonnes = contenu.split(/[;,\t]|\s{2,}/).map((c) => c.trim()).filter((c) => c !== '')
    if (colonnes.length > 2) colonnesIgnorees += colonnes.length - 2

    const prenom = normaliserPrenom(colonnes[0] ?? '')

    if (!PRENOM_VALIDE.test(prenom)) {
      rejetes.push({
        ligne: i + 1,
        contenu,
        motif: 'Prénom absent ou contenant des caractères inattendus.',
      })
      continue
    }

    // Deux « Léa M. » dans la même classe, c'est un doublon de saisie neuf fois
    // sur dix. On le signale plutôt que de créer deux comptes indistinguables.
    const initialeNom = (colonnes[1] ?? '').trim().charAt(0).toUpperCase()
    const empreinte = `${prenom.toLowerCase()}|${initialeNom}`

    if (vus.has(empreinte)) {
      rejetes.push({ ligne: i + 1, contenu, motif: 'Doublon dans la liste.' })
      continue
    }

    vus.add(empreinte)
    retenus.push({ prenom, initialeNom })
  }

  return { retenus, rejetes, colonnesIgnorees }
}

/** « JEAN-luc » → « Jean-Luc ». Les listes arrivent en majuscules d'un tableur. */
function normaliserPrenom(brut: string): string {
  return brut
    .trim()
    .toLocaleLowerCase('fr')
    .replace(/(^|[\s\-'])(\p{L})/gu, (_, avant: string, lettre: string) =>
      avant + lettre.toLocaleUpperCase('fr'),
    )
}

/**
 * Identifiant de connexion : `prenom.uai`, sans accent ni espace.
 *
 * Il est lu à voix haute par un formateur et recopié par un élève de seize ans
 * sur un clavier de salle informatique. Tout ce qui prête à confusion en est
 * exclu — accents, majuscules, apostrophes.
 */
export function identifiantDeConnexion(
  prenom: string,
  uai: string,
  dejaPris: ReadonlySet<string>,
): string {
  const base = `${sansAccent(prenom)}.${sansAccent(uai)}`

  if (!dejaPris.has(base)) return base

  // Deux Léa dans la même classe : `lea2.0820001a`. Le suffixe ne dit rien du
  // nom de famille, qu'on ne connaît pas.
  for (let n = 2; n < 100; n++) {
    const candidat = `${sansAccent(prenom)}${n}.${sansAccent(uai)}`
    if (!dejaPris.has(candidat)) return candidat
  }

  throw new Error(`Impossible de dériver un identifiant pour « ${prenom} ».`)
}

const sansAccent = (texte: string): string =>
  texte
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

/**
 * Code de rattachement d'une classe, distribué aux élèves.
 *
 * Sans les caractères qui se confondent à l'oral ou à l'écrit : ni O/0, ni
 * I/1/L. Un code mal recopié, c'est un élève qui n'entre pas et un formateur
 * qui perd dix minutes de cours.
 */
const ALPHABET_SUR = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function codeDeRattachement(
  nomClasse: string,
  annee: string,
  aleatoire: () => number = Math.random,
): string {
  const prefixe = sansAccent(nomClasse).slice(0, 4).toUpperCase() || 'CLAS'
  const suffixe = Array.from(
    { length: 4 },
    () => ALPHABET_SUR[Math.floor(aleatoire() * ALPHABET_SUR.length)],
  ).join('')

  return `${prefixe}-${annee}-${suffixe}`
}
