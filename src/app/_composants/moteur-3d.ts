/**
 * Le moteur d'affichage, isolé dans son propre module.
 *
 * C'est ce fichier — et lui seul — qui importe Three.js. La visionneuse ne le
 * charge qu'au clic, donc une leçon sans modèle 3D ne paie jamais ces 150 ko.
 * Si un jour quelqu'un importe ce module statiquement depuis une page, le
 * budget de poids en CI le signalera.
 */
import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  DoubleSide,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Scene,
  Vector3,
  WebGLRenderer,
  type Object3D,
} from 'three'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'

export type Options = {
  readonly conteneur: HTMLElement
  readonly url: string
  readonly format: 'glb' | 'stl'
}

/** Renvoie une fonction d'arrêt : sans elle, changer de leçon fuit du GPU. */
export async function afficherModele({ conteneur, url, format }: Options): Promise<() => void> {
  const scene = new Scene()
  scene.background = new Color(0x1a1a18)

  const objet = await charger(url, format)
  scene.add(objet)

  // Cadrage automatique : un modèle de CAO peut arriver en millimètres comme en
  // mètres, et un enseignant n'a pas à s'en occuper.
  const boite = new Box3().setFromObject(objet)
  const taille = boite.getSize(new Vector3())
  const centre = boite.getCenter(new Vector3())
  const rayon = Math.max(taille.x, taille.y, taille.z) || 1

  objet.position.sub(centre)

  const camera = new PerspectiveCamera(45, 1, rayon / 100, rayon * 100)
  let distance = rayon * 2.5
  let azimut = Math.PI / 4
  let hauteur = Math.PI / 5

  scene.add(new AmbientLight(0xffffff, 1.4))
  const soleil = new DirectionalLight(0xffffff, 2)
  soleil.position.set(1, 1.5, 1)
  scene.add(soleil)

  const rendu = new WebGLRenderer({ antialias: true })
  // Plafonné à 2 : au-delà, on quadruple le coût de rendu sans gain visible,
  // et les tablettes des établissements chauffent.
  rendu.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  conteneur.appendChild(rendu.domElement)

  const placerCamera = () => {
    camera.position.set(
      distance * Math.cos(hauteur) * Math.sin(azimut),
      distance * Math.sin(hauteur),
      distance * Math.cos(hauteur) * Math.cos(azimut),
    )
    camera.lookAt(0, 0, 0)
  }

  const dessiner = () => {
    placerCamera()
    rendu.render(scene, camera)
  }

  const redimensionner = () => {
    const { clientWidth, clientHeight } = conteneur
    if (clientWidth === 0 || clientHeight === 0) return
    // Le troisième argument à `true` (défaut) : sans lui, la taille CSS du
    // canvas reste désynchronisée de sa taille interne, et le modèle déborde
    // du cadre en apparaissant décentré — constaté à l'écran.
    rendu.setSize(clientWidth, clientHeight)
    camera.aspect = clientWidth / clientHeight
    camera.updateProjectionMatrix()
    dessiner()
  }

  const observateur = new ResizeObserver(redimensionner)
  observateur.observe(conteneur)
  redimensionner()

  // --- Pilotage -------------------------------------------------------------

  let saisi = false
  let dernier = { x: 0, y: 0 }

  const tourner = (dx: number, dy: number) => {
    azimut -= dx * 0.01
    // Bornée pour ne pas passer par-dessus le pôle, ce qui retourne l'image et
    // désoriente complètement.
    hauteur = Math.max(-1.4, Math.min(1.4, hauteur + dy * 0.01))
    dessiner()
  }

  const zoomer = (facteur: number) => {
    distance = Math.max(rayon * 0.6, Math.min(rayon * 12, distance * facteur))
    dessiner()
  }

  const surPointerDown = (e: PointerEvent) => {
    saisi = true
    dernier = { x: e.clientX, y: e.clientY }
    rendu.domElement.setPointerCapture(e.pointerId)
  }
  const surPointerMove = (e: PointerEvent) => {
    if (!saisi) return
    tourner(e.clientX - dernier.x, e.clientY - dernier.y)
    dernier = { x: e.clientX, y: e.clientY }
  }
  const surPointerUp = () => {
    saisi = false
  }
  const surMolette = (e: WheelEvent) => {
    // `preventDefault` seulement quand on zoome vraiment : sans cela, la page
    // ne défilerait plus dès que le curseur passe sur le modèle.
    e.preventDefault()
    zoomer(e.deltaY > 0 ? 1.1 : 0.9)
  }

  const surClavier = (e: KeyboardEvent) => {
    const pas = 20
    switch (e.key) {
      case 'ArrowLeft':
        tourner(-pas, 0)
        break
      case 'ArrowRight':
        tourner(pas, 0)
        break
      case 'ArrowUp':
        tourner(0, -pas)
        break
      case 'ArrowDown':
        tourner(0, pas)
        break
      case '+':
      case '=':
        zoomer(0.9)
        break
      case '-':
        zoomer(1.1)
        break
      default:
        return
    }
    e.preventDefault()
  }

  rendu.domElement.addEventListener('pointerdown', surPointerDown)
  rendu.domElement.addEventListener('pointermove', surPointerMove)
  rendu.domElement.addEventListener('pointerup', surPointerUp)
  rendu.domElement.addEventListener('wheel', surMolette, { passive: false })
  conteneur.addEventListener('keydown', surClavier)

  return () => {
    observateur.disconnect()
    conteneur.removeEventListener('keydown', surClavier)
    rendu.domElement.removeEventListener('pointerdown', surPointerDown)
    rendu.domElement.removeEventListener('pointermove', surPointerMove)
    rendu.domElement.removeEventListener('pointerup', surPointerUp)
    rendu.domElement.removeEventListener('wheel', surMolette)

    // Libérer explicitement : le ramasse-miettes ne rend pas la mémoire GPU.
    scene.traverse((noeud) => {
      if (noeud instanceof Mesh) {
        noeud.geometry.dispose()
        const matiere = noeud.material
        if (Array.isArray(matiere)) matiere.forEach((m) => m.dispose())
        else matiere.dispose()
      }
    })
    rendu.dispose()
    rendu.domElement.remove()
  }
}

async function charger(url: string, format: 'glb' | 'stl'): Promise<Object3D> {
  if (format === 'glb') {
    const gltf = await new GLTFLoader().loadAsync(url)
    return gltf.scene
  }

  const geometrie = await new STLLoader().loadAsync(url)
  geometrie.computeVertexNormals()

  return new Mesh(
    geometrie,
    new MeshStandardMaterial({
      // Vert désaturé, cohérent avec les jetons de l'application. Métallique à
      // zéro : un rendu métallique rend les arêtes d'une pièce illisibles.
      color: 0x5a9e78,
      metalness: 0,
      roughness: 0.6,
      // Les STL issus de CAO ont souvent des triangles mal orientés. Sans
      // `DoubleSide`, l'élève voit des trous noirs dans la pièce et croit que
      // le modèle est cassé. Le surcoût de rendu est négligeable devant ça.
      side: DoubleSide,
    }),
  )
}
