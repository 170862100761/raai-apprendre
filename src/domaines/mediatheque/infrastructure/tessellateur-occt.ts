import { createRequire } from 'node:module'
// Les types seuls, donc effacés à la compilation. La bibliothèque elle-même
// arrive par un import dynamique, plus bas.
import type { MaillageOcct, Occt } from 'occt-import-js'
import type { MaillageTessele } from '../domaine/glb'
import type { TessellateurStep } from '../ports/tessellation'

/**
 * Tessellation par OpenCascade, compilé en WebAssembly.
 *
 * Le seul endroit du dépôt qui sache lire un STEP.
 *
 * Pas de `server-only` ici, et pour la même raison que dans
 * `identite/infrastructure/supabase-auth.ts` : ce module transite par la surface
 * publique de `mediatheque`, et l'y placer ferait échouer tout test qui importe
 * `@/domaines/mediatheque`.
 *
 * La protection est ailleurs, et c'est celle de Three.js retournée côté
 * serveur : `occt-import-js` n'est jamais importé statiquement. Le module
 * WebAssembly pèse 7,6 Mo — soixante fois le budget de 120 ko de la page leçon
 * (doc 02 §6). Un import statique le placerait dans le graphe de dépendances de
 * tout ce qui touche à la médiathèque ; derrière un `import()` réservé à
 * l'appel, il ne se charge que dans le processus qui tessellerait vraiment.
 */

let instance: Promise<Occt> | null = null

/**
 * Une seule instance pour le processus.
 *
 * Instancier le module coûte l'analyse des 7,6 Mo de WebAssembly. Le faire à
 * chaque téléversement transformerait un dépôt de fichier en plusieurs secondes
 * d'attente, et une salle entière qui dépose ses pièces en même temps
 * saturerait la mémoire du serveur.
 */
function moteur(): Promise<Occt> {
  if (instance) return instance

  instance = (async () => {
    const { default: occtimportjs } = await import('occt-import-js')

    // `locateFile` explicite : Emscripten cherche le `.wasm` à côté de son
    // script, ce qui marche en Node nu mais pas une fois le serveur empaqueté —
    // le bundler déplace le JS et laisse le WebAssembly derrière. On résout donc
    // le chemin depuis le paquet lui-même.
    const exiger = createRequire(import.meta.url)
    const script = exiger.resolve('occt-import-js')

    return occtimportjs({
      locateFile: (fichier) => script.replace(/occt-import-js\.js$/, fichier),
    })
  })().catch((erreur: unknown) => {
    // Sans cela, un échec de chargement resterait mémorisé pour la durée du
    // processus : le premier dépôt malchanceux condamnerait tous les suivants.
    instance = null
    throw erreur
  })

  return instance
}

export const tessellateurOcct: TessellateurStep = {
  async tesseller(contenu, deflexion) {
    const occt = await moteur()

    const resultat = occt.ReadStepFile(contenu, {
      // En fraction de la diagonale de l'encombrement : la finesse à l'écran ne
      // doit pas dépendre de l'unité du fichier, que l'enseignant ignore.
      linearDeflectionType: 'bounding_box_ratio',
      linearDeflection: deflexion,
      // 0,5 radian. Au-delà, les congés et les alésages — omniprésents en
      // agroéquipement — deviennent des polygones visibles.
      angularDeflection: 0.5,
    })

    if (!resultat.success || !resultat.meshes || resultat.meshes.length === 0) {
      return null
    }

    const maillages = resultat.meshes
      .map(convertir)
      .filter((maillage): maillage is MaillageTessele => maillage !== null)

    return maillages.length > 0 ? maillages : null
  },
}

function convertir(maillage: MaillageOcct, rang: number): MaillageTessele | null {
  const positions = maillage.attributes.position.array
  const indices = maillage.index.array

  if (positions.length === 0 || indices.length === 0) return null

  // OCCT ne renvoie pas toujours les normales — un maillage issu d'une face
  // dégénérée en sort sans. Plutôt que d'abandonner la pièce, on les calcule :
  // sans normales, la visionneuse rend un objet uniformément noir.
  const normales =
    maillage.attributes.normal?.array.length === positions.length
      ? maillage.attributes.normal.array
      : normalesParFace(positions, indices)

  return {
    // Le nom vient du fichier de CAO et finit dans le GLB. Il n'est jamais
    // affiché à l'élève, mais il est lisible par qui inspecte le fichier — d'où
    // un repli neutre plutôt qu'une chaîne vide.
    nom: maillage.name || `piece-${rang + 1}`,
    positions,
    normales,
    indices,
    ...(maillage.color ? { couleur: maillage.color } : {}),
  }
}

/**
 * Normales calculées par accumulation sur les faces adjacentes.
 *
 * Le résultat est lissé, ce qui est le bon défaut pour une pièce usinée : une
 * normale par face ferait apparaître les facettes de tessellation comme des
 * arêtes réelles, et l'élève lirait des angles qui n'existent pas.
 */
function normalesParFace(
  positions: readonly number[],
  indices: readonly number[],
): number[] {
  const normales = new Array<number>(positions.length).fill(0)

  for (let i = 0; i < indices.length; i += 3) {
    const a = (indices[i] as number) * 3
    const b = (indices[i + 1] as number) * 3
    const c = (indices[i + 2] as number) * 3

    const ux = (positions[b] as number) - (positions[a] as number)
    const uy = (positions[b + 1] as number) - (positions[a + 1] as number)
    const uz = (positions[b + 2] as number) - (positions[a + 2] as number)
    const vx = (positions[c] as number) - (positions[a] as number)
    const vy = (positions[c + 1] as number) - (positions[a + 1] as number)
    const vz = (positions[c + 2] as number) - (positions[a + 2] as number)

    const nx = uy * vz - uz * vy
    const ny = uz * vx - ux * vz
    const nz = ux * vy - uy * vx

    for (const sommet of [a, b, c]) {
      normales[sommet] = (normales[sommet] as number) + nx
      normales[sommet + 1] = (normales[sommet + 1] as number) + ny
      normales[sommet + 2] = (normales[sommet + 2] as number) + nz
    }
  }

  for (let i = 0; i < normales.length; i += 3) {
    const x = normales[i] as number
    const y = normales[i + 1] as number
    const z = normales[i + 2] as number
    const longueur = Math.hypot(x, y, z)
    if (longueur === 0) {
      // Sommet isolé ou triangles dégénérés : une normale nulle donnerait un
      // point noir. Vers le haut est arbitraire, et c'est assumé.
      normales[i + 1] = 1
      continue
    }
    normales[i] = x / longueur
    normales[i + 1] = y / longueur
    normales[i + 2] = z / longueur
  }

  return normales
}
