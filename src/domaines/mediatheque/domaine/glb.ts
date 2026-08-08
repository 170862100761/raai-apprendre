import { echec, succes, type Resultat } from '@/noyau/resultat'

/**
 * Écriture d'un fichier GLB, à la main.
 *
 * Pourquoi pas l'exportateur de Three.js : ce module est du domaine, et le
 * domaine n'importe rien. Surtout, Three.js n'entre dans ce dépôt que par
 * `_composants/moteur-3d.ts`, chargé au clic de l'élève — l'importer côté
 * serveur ferait de la bibliothèque une dépendance du rendu de page, et le
 * budget de 120 ko de la page leçon vit précisément de cette séparation.
 *
 * Le format s'y prête : un GLB est un entête de 12 octets, un bloc JSON et un
 * bloc binaire. Ce qu'on en écrit ici — positions, normales, indices, une
 * couleur par maillage — est le sous-ensemble strict dont une pièce de CAO
 * tessellée a besoin.
 *
 * Référence : glTF 2.0, §4 (structure GLB) et §5 (accesseurs).
 */

export type MaillageTessele = {
  readonly nom: string
  /** Triplets x, y, z. Longueur multiple de 3. */
  readonly positions: readonly number[]
  /** Triplets, alignés sur `positions`. Même longueur. */
  readonly normales: readonly number[]
  /** Indices de sommets, par triangles. Longueur multiple de 3. */
  readonly indices: readonly number[]
  /** Composantes 0–1. Absente → couleur par défaut de l'application. */
  readonly couleur?: readonly [number, number, number]
}

/**
 * Vert désaturé, celui du chemin STL. Un modèle sans couleur déclarée ne doit
 * pas surgir en gris par défaut au milieu d'une leçon.
 */
const COULEUR_DEFAUT: readonly [number, number, number] = [0.353, 0.62, 0.471]

const MAGIE_GLTF = 0x46546c67 // « glTF »
const MAGIE_JSON = 0x4e4f534a // « JSON »
const MAGIE_BIN = 0x004e4942 // « BIN\0 »

const FLOAT = 5126
const UNSIGNED_INT = 5125
const ARRAY_BUFFER = 34962
const ELEMENT_ARRAY_BUFFER = 34963
const TRIANGLES = 4

type Accesseur = {
  bufferView: number
  componentType: number
  count: number
  type: 'VEC3' | 'SCALAR'
  min?: number[]
  max?: number[]
}

type VueTampon = {
  buffer: 0
  byteOffset: number
  byteLength: number
  target: number
}

/**
 * Assemble le GLB.
 *
 * Échoue plutôt que de produire un fichier que la visionneuse afficherait de
 * travers : un maillage incohérent donne à l'élève une pièce trouée, et il
 * conclut que la plateforme est cassée. Mieux vaut un statut « échoué » côté
 * serveur, visible par l'enseignant.
 */
export function ecrireGlb(maillages: readonly MaillageTessele[]): Resultat<Uint8Array> {
  if (maillages.length === 0) {
    return echec('donnees_invalides', 'Aucun maillage à écrire.')
  }

  for (const maillage of maillages) {
    const invalide = verifier(maillage)
    if (invalide) return echec('donnees_invalides', invalide)
  }

  const blocs: Uint8Array[] = []
  const vues: VueTampon[] = []
  const accesseurs: Accesseur[] = []
  const materiaux: Record<string, unknown>[] = []
  const meshes: Record<string, unknown>[] = []
  const noeuds: Record<string, unknown>[] = []

  let decalage = 0

  /**
   * Chaque vue est alignée sur 4 octets. glTF l'exige pour les accesseurs de
   * 4 octets, et un lecteur qui tolère un désalignement n'est pas une garantie
   * sur laquelle bâtir.
   */
  const ajouterVue = (donnees: Uint8Array, target: number): number => {
    const bourrage = (4 - (decalage % 4)) % 4
    if (bourrage > 0) {
      blocs.push(new Uint8Array(bourrage))
      decalage += bourrage
    }
    blocs.push(donnees)
    vues.push({
      buffer: 0,
      byteOffset: decalage,
      byteLength: donnees.byteLength,
      target,
    })
    decalage += donnees.byteLength
    return vues.length - 1
  }

  for (const maillage of maillages) {
    const nbSommets = maillage.positions.length / 3

    const vuePositions = ajouterVue(enFloat32(maillage.positions), ARRAY_BUFFER)
    const vueNormales = ajouterVue(enFloat32(maillage.normales), ARRAY_BUFFER)
    // Uint32 sans condition : basculer en Uint16 sous 65 536 sommets
    // économiserait quelques kilo-octets et introduirait un second chemin de
    // code — donc un second endroit où se tromper, pour un gain que la
    // compression HTTP reprend déjà.
    const vueIndices = ajouterVue(enUint32(maillage.indices), ELEMENT_ARRAY_BUFFER)

    const { min, max } = etendue(maillage.positions)

    accesseurs.push({
      bufferView: vuePositions,
      componentType: FLOAT,
      count: nbSommets,
      type: 'VEC3',
      // Obligatoires sur POSITION : c'est ce que lisent les visionneuses pour
      // cadrer la caméra sans parcourir tous les sommets.
      min,
      max,
    })
    const iPositions = accesseurs.length - 1

    accesseurs.push({
      bufferView: vueNormales,
      componentType: FLOAT,
      count: nbSommets,
      type: 'VEC3',
    })
    const iNormales = accesseurs.length - 1

    accesseurs.push({
      bufferView: vueIndices,
      componentType: UNSIGNED_INT,
      count: maillage.indices.length,
      type: 'SCALAR',
    })
    const iIndices = accesseurs.length - 1

    const [r, v, b] = maillage.couleur ?? COULEUR_DEFAUT
    materiaux.push({
      name: `matiere-${materiaux.length}`,
      pbrMetallicRoughness: {
        baseColorFactor: [r, v, b, 1],
        // Métallique à zéro : un rendu métallique noie les arêtes d'une pièce,
        // et c'est l'arête que l'élève doit lire.
        metallicFactor: 0,
        roughnessFactor: 0.6,
      },
      // Même raison que le `DoubleSide` du chemin STL : les pièces de CAO
      // arrivent avec des triangles mal orientés, et l'élève voit alors des
      // trous noirs qu'il prend pour un modèle cassé.
      doubleSided: true,
    })

    meshes.push({
      name: maillage.nom,
      primitives: [
        {
          attributes: { POSITION: iPositions, NORMAL: iNormales },
          indices: iIndices,
          material: materiaux.length - 1,
          mode: TRIANGLES,
        },
      ],
    })

    noeuds.push({ name: maillage.nom, mesh: meshes.length - 1 })
  }

  const binaire = concatener(blocs)

  const gltf = {
    asset: { version: '2.0', generator: 'raai-apprendre' },
    scene: 0,
    scenes: [{ nodes: noeuds.map((_, i) => i) }],
    nodes: noeuds,
    meshes,
    materials: materiaux,
    accessors: accesseurs,
    bufferViews: vues,
    buffers: [{ byteLength: binaire.byteLength }],
  }

  return succes(assembler(gltf, binaire))
}

function verifier(maillage: MaillageTessele): string | null {
  const { positions, normales, indices, nom } = maillage

  if (positions.length === 0) return `Maillage « ${nom} » sans sommet.`
  if (positions.length % 3 !== 0) {
    return `Maillage « ${nom} » : positions non multiples de 3.`
  }
  if (normales.length !== positions.length) {
    return `Maillage « ${nom} » : ${normales.length} normales pour ${positions.length} positions.`
  }
  if (indices.length === 0) return `Maillage « ${nom} » sans triangle.`
  if (indices.length % 3 !== 0) {
    return `Maillage « ${nom} » : indices non multiples de 3.`
  }

  // Un indice hors bornes ne casse pas l'écriture — il casse l'affichage, chez
  // l'élève, une semaine plus tard. On le refuse ici.
  const nbSommets = positions.length / 3
  for (const indice of indices) {
    if (!Number.isInteger(indice) || indice < 0 || indice >= nbSommets) {
      return `Maillage « ${nom} » : indice ${indice} hors des ${nbSommets} sommets.`
    }
  }

  if (positions.some((valeur) => !Number.isFinite(valeur))) {
    return `Maillage « ${nom} » : coordonnée non finie.`
  }

  return null
}

function etendue(positions: readonly number[]): { min: number[]; max: number[] } {
  const min = [Infinity, Infinity, Infinity]
  const max = [-Infinity, -Infinity, -Infinity]

  for (let i = 0; i < positions.length; i += 3) {
    for (let axe = 0; axe < 3; axe++) {
      // `Math.fround` : les bornes doivent décrire les valeurs telles qu'elles
      // seront stockées, en simple précision. Sans cela une borne calculée en
      // double précision peut se retrouver à l'intérieur du nuage de points, et
      // un validateur glTF le signale à juste titre.
      const valeur = Math.fround(positions[i + axe] as number)
      if (valeur < (min[axe] as number)) min[axe] = valeur
      if (valeur > (max[axe] as number)) max[axe] = valeur
    }
  }

  return { min, max }
}

function enFloat32(valeurs: readonly number[]): Uint8Array {
  const tableau = new Float32Array(valeurs)
  return new Uint8Array(tableau.buffer, tableau.byteOffset, tableau.byteLength)
}

function enUint32(valeurs: readonly number[]): Uint8Array {
  const tableau = new Uint32Array(valeurs)
  return new Uint8Array(tableau.buffer, tableau.byteOffset, tableau.byteLength)
}

function concatener(blocs: readonly Uint8Array[]): Uint8Array {
  const total = blocs.reduce((somme, bloc) => somme + bloc.byteLength, 0)
  const sortie = new Uint8Array(total)
  let position = 0
  for (const bloc of blocs) {
    sortie.set(bloc, position)
    position += bloc.byteLength
  }
  return sortie
}

/** Entête + bloc JSON + bloc binaire, chacun aligné sur 4 octets. */
function assembler(gltf: unknown, binaire: Uint8Array): Uint8Array {
  const json = new TextEncoder().encode(JSON.stringify(gltf))
  // Le bourrage du bloc JSON se fait avec des espaces, celui du binaire avec
  // des zéros : c'est la spécification, et un analyseur strict le vérifie.
  const jsonRembourre = rembourrer(json, 0x20)
  const binaireRembourre = rembourrer(binaire, 0x00)

  const total = 12 + 8 + jsonRembourre.byteLength + 8 + binaireRembourre.byteLength
  const sortie = new Uint8Array(total)
  const vue = new DataView(sortie.buffer)

  vue.setUint32(0, MAGIE_GLTF, true)
  vue.setUint32(4, 2, true)
  vue.setUint32(8, total, true)

  vue.setUint32(12, jsonRembourre.byteLength, true)
  vue.setUint32(16, MAGIE_JSON, true)
  sortie.set(jsonRembourre, 20)

  const debutBin = 20 + jsonRembourre.byteLength
  vue.setUint32(debutBin, binaireRembourre.byteLength, true)
  vue.setUint32(debutBin + 4, MAGIE_BIN, true)
  sortie.set(binaireRembourre, debutBin + 8)

  return sortie
}

function rembourrer(donnees: Uint8Array, octet: number): Uint8Array {
  const bourrage = (4 - (donnees.byteLength % 4)) % 4
  if (bourrage === 0) return donnees

  const sortie = new Uint8Array(donnees.byteLength + bourrage)
  sortie.set(donnees, 0)
  sortie.fill(octet, donnees.byteLength)
  return sortie
}
