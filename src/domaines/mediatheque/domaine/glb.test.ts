import { describe, expect, it } from 'vitest'
import { ecrireGlb, type MaillageTessele } from './glb'

/**
 * Un GLB mal formé ne se voit pas à l'écriture : il se voit chez l'élève, une
 * semaine plus tard, sous la forme d'une pièce noire ou d'un écran vide. Ces
 * tests relisent donc ce qui a été écrit, octet par octet, plutôt que de
 * vérifier qu'une fonction a rendu quelque chose.
 */

/** Relit un GLB : entête, bloc JSON, bloc binaire. */
function relire(glb: Uint8Array) {
  const vue = new DataView(glb.buffer, glb.byteOffset, glb.byteLength)

  const magie = vue.getUint32(0, true)
  const version = vue.getUint32(4, true)
  const longueurTotale = vue.getUint32(8, true)

  const longueurJson = vue.getUint32(12, true)
  const typeJson = vue.getUint32(16, true)
  const json = JSON.parse(
    new TextDecoder().decode(glb.subarray(20, 20 + longueurJson)),
  )

  const debutBin = 20 + longueurJson
  const longueurBin = vue.getUint32(debutBin, true)
  const typeBin = vue.getUint32(debutBin + 4, true)
  const binaire = glb.subarray(debutBin + 8, debutBin + 8 + longueurBin)

  return { magie, version, longueurTotale, typeJson, json, typeBin, binaire }
}

/** Un triangle, le plus petit maillage qui ait un sens. */
const TRIANGLE: MaillageTessele = {
  nom: 'triangle',
  positions: [0, 0, 0, 1, 0, 0, 0, 1, 0],
  normales: [0, 0, 1, 0, 0, 1, 0, 0, 1],
  indices: [0, 1, 2],
}

describe('écriture d’un GLB', () => {
  it('produit un entête conforme à la spécification', () => {
    const resultat = ecrireGlb([TRIANGLE])
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return

    const { magie, version, longueurTotale, typeJson, typeBin } = relire(resultat.valeur)

    expect(magie).toBe(0x46546c67) // « glTF »
    expect(version).toBe(2)
    expect(typeJson).toBe(0x4e4f534a) // « JSON »
    expect(typeBin).toBe(0x004e4942) // « BIN\0 »
    // La longueur annoncée est celle du fichier : un lecteur qui la croit ne
    // doit pas tomber à côté.
    expect(longueurTotale).toBe(resultat.valeur.byteLength)
  })

  it('aligne chaque bloc et chaque vue sur quatre octets', () => {
    // Trois sommets font 36 octets de positions : un compte qui ne tombe pas
    // juste sur les frontières, donc du bourrage à produire.
    const resultat = ecrireGlb([TRIANGLE])
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return

    expect(resultat.valeur.byteLength % 4).toBe(0)

    const { json } = relire(resultat.valeur)
    for (const vue of json.bufferViews) {
      expect(vue.byteOffset % 4).toBe(0)
    }
  })

  it('restitue les positions telles qu’elles sont entrées', () => {
    const resultat = ecrireGlb([TRIANGLE])
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return

    const { json, binaire } = relire(resultat.valeur)
    const accesseur = json.accessors[json.meshes[0].primitives[0].attributes.POSITION]
    const vue = json.bufferViews[accesseur.bufferView]

    const positions = new Float32Array(
      binaire.slice(vue.byteOffset, vue.byteOffset + vue.byteLength).buffer,
    )

    expect(Array.from(positions)).toEqual(TRIANGLE.positions)
    expect(accesseur.count).toBe(3)
  })

  it('déclare des bornes qui encadrent réellement les sommets', () => {
    // Bornes obligatoires sur POSITION : c'est ce que lit une visionneuse pour
    // cadrer sa caméra sans parcourir tous les sommets.
    const resultat = ecrireGlb([
      {
        ...TRIANGLE,
        positions: [-3.5, 0, 2, 1, -7, 0, 0, 1, 9.25],
      },
    ])
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return

    const { json } = relire(resultat.valeur)
    const accesseur = json.accessors[json.meshes[0].primitives[0].attributes.POSITION]

    expect(accesseur.min).toEqual([-3.5, -7, 0])
    expect(accesseur.max).toEqual([1, 1, 9.25])
  })

  it('écrit un matériau à double face', () => {
    // Les pièces de CAO arrivent avec des triangles mal orientés. Sans double
    // face, l'élève voit des trous noirs et croit le modèle cassé — c'est la
    // même raison qui a fait mettre `DoubleSide` sur le chemin STL.
    const resultat = ecrireGlb([TRIANGLE])
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return

    const { json } = relire(resultat.valeur)
    expect(json.materials[0].doubleSided).toBe(true)
    expect(json.materials[0].pbrMetallicRoughness.metallicFactor).toBe(0)
  })

  it('reprend la couleur du maillage quand il y en a une', () => {
    const resultat = ecrireGlb([{ ...TRIANGLE, couleur: [0.25, 0.5, 0.75] }])
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return

    const { json } = relire(resultat.valeur)
    expect(json.materials[0].pbrMetallicRoughness.baseColorFactor).toEqual([
      0.25, 0.5, 0.75, 1,
    ])
  })

  it('donne un nœud et un matériau à chaque maillage', () => {
    const resultat = ecrireGlb([
      TRIANGLE,
      { ...TRIANGLE, nom: 'second', couleur: [1, 0, 0] },
    ])
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return

    const { json } = relire(resultat.valeur)
    expect(json.meshes).toHaveLength(2)
    expect(json.materials).toHaveLength(2)
    expect(json.nodes).toHaveLength(2)
    // Toutes les pièces d'un assemblage doivent être dans la scène : en oublier
    // une donne un modèle amputé, sans erreur nulle part.
    expect(json.scenes[0].nodes).toEqual([0, 1])
    expect(json.meshes[1].name).toBe('second')
  })
})

describe('refus d’un maillage incohérent', () => {
  // Refuser ici plutôt que de laisser passer : le fichier s'écrirait quand
  // même, et le défaut n'apparaîtrait qu'à l'affichage, chez l'élève.

  it('refuse une liste vide', () => {
    expect(ecrireGlb([]).ok).toBe(false)
  })

  it('refuse un décompte de normales qui ne suit pas les positions', () => {
    const resultat = ecrireGlb([{ ...TRIANGLE, normales: [0, 0, 1] }])
    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.erreur.message).toMatch(/normales/)
  })

  it('refuse un indice qui sort du nuage de sommets', () => {
    const resultat = ecrireGlb([{ ...TRIANGLE, indices: [0, 1, 7] }])
    expect(resultat.ok).toBe(false)
    if (resultat.ok) return
    expect(resultat.erreur.message).toMatch(/hors des 3 sommets/)
  })

  it('refuse des indices qui ne forment pas des triangles', () => {
    expect(ecrireGlb([{ ...TRIANGLE, indices: [0, 1] }]).ok).toBe(false)
  })

  it('refuse une coordonnée non finie', () => {
    const resultat = ecrireGlb([
      { ...TRIANGLE, positions: [0, 0, 0, 1, 0, 0, 0, Number.NaN, 0] },
    ])
    expect(resultat.ok).toBe(false)
  })
})
