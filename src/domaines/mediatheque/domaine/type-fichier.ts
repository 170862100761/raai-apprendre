/**
 * Ce qu'on accepte de recevoir, et comment on le vérifie.
 *
 * Une leçon peut contenir des fichiers déposés par des enseignants et servis à
 * des mineurs. Deux règles en découlent :
 *
 * 1. **Liste blanche**, jamais liste noire. Ce qui n'est pas explicitement
 *    prévu est refusé.
 * 2. **L'extension ne prouve rien.** `schema.png` peut être un exécutable, un
 *    HTML piégé ou un SVG contenant du script. On lit les premiers octets.
 *
 * Les formats CAO propriétaires (SolidWorks, CATIA) sont acceptés comme
 * fichiers téléchargeables — jamais interprétés, ni côté serveur ni dans le
 * navigateur.
 */

export type CategorieFichier = 'image' | 'document' | 'video' | 'modele3d' | 'archive'

export type TypeAccepte = {
  readonly mime: string
  readonly extensions: readonly string[]
  readonly categorie: CategorieFichier
  readonly tailleMaxOctets: number
  /**
   * Octets de tête attendus. `null` pour les formats sans signature stable
   * (STEP et STL ASCII sont du texte) — ceux-là sont vérifiés autrement.
   */
  readonly signatures: readonly (readonly number[])[] | null
  /**
   * Vrai si le navigateur peut l'afficher directement. Tout le reste est servi
   * en téléchargement, pour qu'aucun contenu déposé ne s'exécute dans l'origine
   * qui porte les cookies de session.
   */
  readonly affichable: boolean
}

const Mo = 1024 * 1024

export const TYPES_ACCEPTES: readonly TypeAccepte[] = [
  {
    mime: 'image/png',
    extensions: ['png'],
    categorie: 'image',
    tailleMaxOctets: 10 * Mo,
    signatures: [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    affichable: true,
  },
  {
    mime: 'image/jpeg',
    extensions: ['jpg', 'jpeg'],
    categorie: 'image',
    tailleMaxOctets: 10 * Mo,
    signatures: [[0xff, 0xd8, 0xff]],
    affichable: true,
  },
  {
    mime: 'image/webp',
    extensions: ['webp'],
    categorie: 'image',
    tailleMaxOctets: 10 * Mo,
    // RIFF….WEBP : les octets 4 à 7 sont la taille, on vérifie l'entête RIFF
    // puis la marque WEBP à l'offset 8 (cf. `signatureValide`).
    signatures: [[0x52, 0x49, 0x46, 0x46]],
    affichable: true,
  },
  {
    mime: 'application/pdf',
    extensions: ['pdf'],
    categorie: 'document',
    tailleMaxOctets: 50 * Mo,
    signatures: [[0x25, 0x50, 0x44, 0x46, 0x2d]], // %PDF-
    // Un PDF peut contenir du JavaScript. Servi en téléchargement, il ne
    // s'exécute pas dans notre origine.
    affichable: false,
  },
  {
    mime: 'video/mp4',
    extensions: ['mp4'],
    categorie: 'video',
    tailleMaxOctets: 500 * Mo,
    signatures: [[0x66, 0x74, 0x79, 0x70]], // « ftyp », à l'offset 4
    affichable: true,
  },
  {
    mime: 'model/gltf-binary',
    extensions: ['glb'],
    categorie: 'modele3d',
    tailleMaxOctets: 100 * Mo,
    signatures: [[0x67, 0x6c, 0x54, 0x46]], // glTF
    affichable: false,
  },
  {
    mime: 'model/step',
    extensions: ['step', 'stp'],
    categorie: 'modele3d',
    tailleMaxOctets: 200 * Mo,
    signatures: null, // texte : « ISO-10303-21 », vérifié par `debutTexte`
    affichable: false,
  },
  {
    mime: 'model/stl',
    extensions: ['stl'],
    categorie: 'modele3d',
    tailleMaxOctets: 200 * Mo,
    signatures: null, // ASCII (« solid ») ou binaire (entête libre de 80 o.)
    affichable: false,
  },
  {
    // Formats propriétaires : stockés, téléchargeables, jamais interprétés.
    mime: 'application/octet-stream',
    extensions: ['sldprt', 'sldasm', 'catpart', 'catproduct', 'dxf', 'dwg', 'fcstd'],
    categorie: 'archive',
    tailleMaxOctets: 200 * Mo,
    signatures: null,
    affichable: false,
  },
]

export function typePourExtension(nom: string): TypeAccepte | null {
  const extension = nom.split('.').pop()?.toLowerCase()
  if (!extension) return null
  return TYPES_ACCEPTES.find((t) => t.extensions.includes(extension)) ?? null
}

/** Marques textuelles, pour les formats sans signature binaire stable. */
const DEBUTS_TEXTE: Record<string, readonly string[]> = {
  'model/step': ['ISO-10303-21'],
  'model/stl': ['solid'],
}

/**
 * Vérifie que le contenu correspond bien au type annoncé.
 *
 * Renvoie `true` quand aucune vérification n'est possible (formats
 * propriétaires binaires opaques) : on ne peut pas prouver leur nature, mais
 * ils ne sont ni interprétés ni affichés, donc le risque reste contenu.
 */
export function signatureValide(type: TypeAccepte, tete: Uint8Array): boolean {
  if (type.mime === 'video/mp4') {
    // « ftyp » se trouve à l'offset 4, pas 0.
    return correspond(tete, [0x66, 0x74, 0x79, 0x70], 4)
  }

  if (type.mime === 'image/webp') {
    return (
      correspond(tete, [0x52, 0x49, 0x46, 0x46], 0) &&
      correspond(tete, [0x57, 0x45, 0x42, 0x50], 8)
    )
  }

  const marques = DEBUTS_TEXTE[type.mime]
  if (marques) {
    const debut = new TextDecoder('latin1').decode(tete.slice(0, 128))
    // Le STL binaire n'a pas de marque : son entête de 80 octets est libre.
    // On l'accepte, il n'est de toute façon jamais interprété.
    return type.mime === 'model/stl' ? true : marques.some((m) => debut.includes(m))
  }

  if (!type.signatures) return true

  return type.signatures.some((signature) => correspond(tete, signature, 0))
}

function correspond(tete: Uint8Array, signature: readonly number[], decalage: number): boolean {
  if (tete.length < decalage + signature.length) return false
  return signature.every((octet, i) => tete[decalage + i] === octet)
}

/**
 * Nom de fichier assaini.
 *
 * Le nom vient d'un poste Windows d'établissement : accents, espaces,
 * apostrophes, et parfois des séquences `../` d'un navigateur mal élevé. On ne
 * l'utilise jamais comme chemin — le chemin de stockage est un UUID — mais il
 * est réaffiché, et il part dans un en-tête HTTP.
 */
export function nomSur(nom: string): string {
  const base = nom.split(/[/\\]/).pop() ?? 'fichier'
  return (
    base
      .normalize('NFD')
      // Marques diacritiques, notées explicitement : écrites au naturel, elles
      // sont invisibles dans un diff et survivent mal aux copier-coller.
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Za-z0-9._-]/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^[.-]+/, '')
      .slice(0, 120) || 'fichier'
  )
}
