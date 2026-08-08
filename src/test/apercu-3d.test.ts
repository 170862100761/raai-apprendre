import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { identifiant, type IdentifiantEtablissement } from '@/noyau/identifiants'
import {
  BUDGET_TRIANGLES,
  cheminApercu,
  ecrireGlb,
  nombreDeTriangles,
  preparerApercu3d,
  servirApercu3d,
  televerser,
  tessellateurOcct,
  type DepotMediatheque,
  type MaillageTessele,
  type RessourceStockee,
  type StatutTraitement,
  type StockageObjet,
  type TessellateurStep,
} from '@/domaines/mediatheque'

/**
 * La pré-tessellation, de bout en bout.
 *
 * Deux familles ici, et la distinction compte. La première fait tourner
 * OpenCascade pour de vrai sur une pièce du dépôt : c'est le seul moyen de
 * savoir que la chaîne STEP → triangles → GLB tient. La seconde utilise des
 * doublures pour éprouver la politique — budget, dégradation, échecs — sans
 * payer une tessellation à chaque cas.
 *
 * La pièce d'essai est engendrée par un script du dépôt, et non tirée d'une
 * bibliothèque de modèles : un fichier tiers dans un dépôt public pose une
 * question de licence que rien n'oblige à se poser.
 */

const PIECE = join(process.cwd(), 'src', 'test', 'fichiers', 'piece-essai.stp')

const ETABLISSEMENT = identifiant<IdentifiantEtablissement>(
  '00000000-0000-4000-8000-000000000001',
)

// --- Doublures ------------------------------------------------------------

class DepotEnMemoire implements DepotMediatheque {
  readonly ressources = new Map<string, RessourceStockee>()
  private compteur = 0

  async enregistrer(entree: {
    etablissementId: IdentifiantEtablissement
    nom: string
    typeMime: string
    cheminStockage: string
    tailleOctets: number
    statutTraitement: StatutTraitement
  }): Promise<string> {
    this.compteur += 1
    const id = `ressource-${this.compteur}`
    this.ressources.set(id, { id, cheminApercu: null, ...entree })
    return id
  }

  async charger(id: string): Promise<RessourceStockee | null> {
    return this.ressources.get(id) ?? null
  }

  async enregistrerApercu(id: string, chemin: string): Promise<void> {
    const ressource = this.ressources.get(id)
    if (!ressource) throw new Error(`Ressource inconnue : ${id}`)
    this.ressources.set(id, {
      ...ressource,
      cheminApercu: chemin,
      statutTraitement: 'pret',
    })
  }

  async marquerTraitement(id: string, statut: StatutTraitement): Promise<void> {
    const ressource = this.ressources.get(id)
    if (!ressource) throw new Error(`Ressource inconnue : ${id}`)
    this.ressources.set(id, { ...ressource, statutTraitement: statut })
  }
}

class StockageEnMemoire implements StockageObjet {
  readonly fichiers = new Map<string, Uint8Array>()

  async ecrire(chemin: string, contenu: Uint8Array): Promise<void> {
    this.fichiers.set(chemin, contenu)
  }

  async lire(chemin: string): Promise<Uint8Array | null> {
    return this.fichiers.get(chemin) ?? null
  }

  async supprimer(chemin: string): Promise<void> {
    this.fichiers.delete(chemin)
  }
}

/** Rend un maillage dont la finesse suit la déflexion demandée. */
function tessellateurRegle(
  trianglesParDeflexion: ReadonlyMap<number, number>,
): TessellateurStep & { deflexionsEssayees: number[] } {
  const deflexionsEssayees: number[] = []

  return {
    deflexionsEssayees,
    async tesseller(_contenu, deflexion) {
      deflexionsEssayees.push(deflexion)
      const triangles = trianglesParDeflexion.get(deflexion)
      if (triangles === undefined) return null
      return [maillageDe(triangles)]
    },
  }
}

/** Un éventail de triangles : la façon la plus courte d'en produire N valides. */
function maillageDe(triangles: number): MaillageTessele {
  const positions: number[] = [0, 0, 0]
  const normales: number[] = [0, 0, 1]
  const indices: number[] = []

  for (let i = 0; i < triangles + 1; i++) {
    positions.push(Math.cos(i), Math.sin(i), 0)
    normales.push(0, 0, 1)
  }
  for (let i = 1; i <= triangles; i++) {
    indices.push(0, i, i + 1)
  }

  return { nom: 'essai', positions, normales, indices }
}

// --- Tessellation réelle --------------------------------------------------

describe('tessellation d’un vrai fichier STEP', () => {
  let step: Uint8Array

  beforeEach(async () => {
    step = new Uint8Array(await readFile(PIECE))
  })

  it('rend le pavé attendu : douze triangles, aux bonnes dimensions', async () => {
    const maillages = await tessellateurOcct.tesseller(step, 0.001)

    expect(maillages).not.toBeNull()
    if (!maillages) return

    // Six faces planes, deux triangles chacune. Un pavé ne se tessellerait pas
    // plus finement, quelle que soit la déflexion : c'est ce qui rend ce test
    // stable d'une version d'OpenCascade à l'autre.
    expect(nombreDeTriangles(maillages)).toBe(12)

    const positions = maillages.flatMap((m) => [...m.positions])
    const x = positions.filter((_, i) => i % 3 === 0)
    const y = positions.filter((_, i) => i % 3 === 1)
    const z = positions.filter((_, i) => i % 3 === 2)

    expect([Math.min(...x), Math.max(...x)]).toEqual([0, 40])
    expect([Math.min(...y), Math.max(...y)]).toEqual([0, 20])
    expect([Math.min(...z), Math.max(...z)]).toEqual([0, 10])
  })

  it('rend autant de normales que de positions', async () => {
    // Sans normales, la visionneuse rend un objet uniformément noir — un défaut
    // qui ne se voit qu'à l'écran, et jamais dans un test qui compterait les
    // triangles.
    const maillages = await tessellateurOcct.tesseller(step, 0.001)
    expect(maillages).not.toBeNull()
    if (!maillages) return

    for (const maillage of maillages) {
      expect(maillage.normales).toHaveLength(maillage.positions.length)
      expect(maillage.normales.every(Number.isFinite)).toBe(true)
    }
  })

  it('donne un GLB relisible', async () => {
    const maillages = await tessellateurOcct.tesseller(step, 0.001)
    expect(maillages).not.toBeNull()
    if (!maillages) return

    const glb = ecrireGlb(maillages)
    expect(glb.ok).toBe(true)
    if (!glb.ok) return

    const vue = new DataView(
      glb.valeur.buffer,
      glb.valeur.byteOffset,
      glb.valeur.byteLength,
    )
    expect(vue.getUint32(0, true)).toBe(0x46546c67) // « glTF »
    expect(vue.getUint32(8, true)).toBe(glb.valeur.byteLength)
  })

  it('rend `null` sur un fichier qui n’est pas du STEP', async () => {
    // Un verdict, pas une panne : le fichier reste téléchargeable, et
    // l'appelant doit pouvoir le distinguer d'une erreur d'infrastructure.
    const maillages = await tessellateurOcct.tesseller(
      new TextEncoder().encode('ceci n’est pas une pièce'),
      0.001,
    )
    expect(maillages).toBeNull()
  })
})

// --- Le cas d'usage -------------------------------------------------------

describe('préparation de l’aperçu', () => {
  let depot: DepotEnMemoire
  let stockage: StockageEnMemoire

  beforeEach(() => {
    depot = new DepotEnMemoire()
    stockage = new StockageEnMemoire()
  })

  /** Dépose la pièce d'essai et rend son identifiant. */
  async function deposer(): Promise<string> {
    const contenu = new Uint8Array(await readFile(PIECE))
    const resultat = await televerser(
      { etablissementId: ETABLISSEMENT, nom: 'piece-essai.stp', contenu },
      { depot, stockage, identifiant: () => 'fichier' },
    )
    expect(resultat.ok).toBe(true)
    if (!resultat.ok) throw new Error(resultat.erreur.message)
    return resultat.valeur.ressourceId
  }

  it('laisse un STEP « en attente » au dépôt, et le signale à l’appelant', async () => {
    const contenu = new Uint8Array(await readFile(PIECE))
    const resultat = await televerser(
      { etablissementId: ETABLISSEMENT, nom: 'piece-essai.stp', contenu },
      { depot, stockage, identifiant: () => 'fichier' },
    )

    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return

    expect(resultat.valeur.apercuAProduire).toBe(true)
    const ressource = await depot.charger(resultat.valeur.ressourceId)
    expect(ressource?.statutTraitement).toBe('en_attente')
  })

  it('déclare « prêt » d’emblée un format sans conversion à faire', async () => {
    // Un « en attente » que rien ne fait avancer est pire qu'absent : personne
    // ne sait s'il faut attendre ou renoncer.
    const png = new Uint8Array(64)
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)

    const resultat = await televerser(
      { etablissementId: ETABLISSEMENT, nom: 'schema.png', contenu: png },
      { depot, stockage, identifiant: () => 'image' },
    )

    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return

    expect(resultat.valeur.apercuAProduire).toBe(false)
    const ressource = await depot.charger(resultat.valeur.ressourceId)
    expect(ressource?.statutTraitement).toBe('pret')
  })

  it('produit le GLB, l’enregistre et passe la ressource à « prêt »', async () => {
    const ressourceId = await deposer()

    const resultat = await preparerApercu3d(ressourceId, {
      depot,
      stockage,
      tessellateur: tessellateurOcct,
    })

    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return

    expect(resultat.valeur.triangles).toBe(12)

    const ressource = await depot.charger(ressourceId)
    expect(ressource?.statutTraitement).toBe('pret')
    expect(ressource?.cheminApercu).toBe(cheminApercu(`${ETABLISSEMENT}/fichier`))
    expect(stockage.fichiers.has(resultat.valeur.cheminApercu)).toBe(true)
  })

  it('sert l’aperçu, et l’original reste intact', async () => {
    const ressourceId = await deposer()
    await preparerApercu3d(ressourceId, {
      depot,
      stockage,
      tessellateur: tessellateurOcct,
    })

    const servi = await servirApercu3d(ressourceId, { depot, stockage })
    expect(servi.ok).toBe(true)
    if (!servi.ok) return

    const vue = new DataView(
      servi.valeur.contenu.buffer,
      servi.valeur.contenu.byteOffset,
      servi.valeur.contenu.byteLength,
    )
    expect(vue.getUint32(0, true)).toBe(0x46546c67)

    // Un enseignant qui télécharge un STEP doit recevoir son STEP, pas une
    // approximation triangulée.
    const original = await stockage.lire(`${ETABLISSEMENT}/fichier`)
    expect(new TextDecoder().decode(original?.slice(0, 12))).toBe('ISO-10303-21')
  })

  it('ne recalcule pas un aperçu déjà produit', async () => {
    // L'idempotence est ce qui rend une reprise après incident sans danger.
    const ressourceId = await deposer()
    const options = { depot, stockage, tessellateur: tessellateurOcct }

    expect((await preparerApercu3d(ressourceId, options)).ok).toBe(true)

    const second = await preparerApercu3d(ressourceId, options)
    expect(second.ok).toBe(false)
    if (second.ok) return
    expect(second.erreur.code).toBe('conflit')
  })

  it('n’a rien à produire pour un format qui n’est pas du STEP', async () => {
    const png = new Uint8Array(64)
    png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0)
    const depose = await televerser(
      { etablissementId: ETABLISSEMENT, nom: 'schema.png', contenu: png },
      { depot, stockage, identifiant: () => 'image' },
    )
    expect(depose.ok).toBe(true)
    if (!depose.ok) return

    const resultat = await preparerApercu3d(depose.valeur.ressourceId, {
      depot,
      stockage,
      tessellateur: tessellateurOcct,
    })
    expect(resultat.ok).toBe(false)
  })

  it('marque « échoué » un STEP que la tessellation refuse, sans perdre le fichier', async () => {
    const ressourceId = await deposer()

    const resultat = await preparerApercu3d(ressourceId, {
      depot,
      stockage,
      tessellateur: { async tesseller() { return null } },
    })

    expect(resultat.ok).toBe(false)

    const ressource = await depot.charger(ressourceId)
    expect(ressource?.statutTraitement).toBe('echoue')
    expect(ressource?.cheminApercu).toBeNull()
    // Le STEP garde toute sa valeur ouvert dans un logiciel de CAO : le perdre
    // parce que nous ne savons pas l'afficher serait une punition absurde.
    expect(stockage.fichiers.has(`${ETABLISSEMENT}/fichier`)).toBe(true)
  })

  it('marque « échoué » quand le fichier source a disparu du stockage', async () => {
    // Sinon un travail de fond réessaierait indéfiniment sur un fichier absent.
    const ressourceId = await deposer()
    stockage.fichiers.delete(`${ETABLISSEMENT}/fichier`)

    const resultat = await preparerApercu3d(ressourceId, {
      depot,
      stockage,
      tessellateur: tessellateurOcct,
    })

    expect(resultat.ok).toBe(false)
    expect((await depot.charger(ressourceId))?.statutTraitement).toBe('echoue')
  })
})

// --- Le budget ------------------------------------------------------------

describe('budget de triangles', () => {
  let depot: DepotEnMemoire
  let stockage: StockageEnMemoire

  beforeEach(() => {
    depot = new DepotEnMemoire()
    stockage = new StockageEnMemoire()
  })

  async function deposerPuisPreparer(tessellateur: TessellateurStep) {
    const contenu = new Uint8Array(await readFile(PIECE))
    const depose = await televerser(
      { etablissementId: ETABLISSEMENT, nom: 'piece-essai.stp', contenu },
      { depot, stockage, identifiant: () => 'fichier' },
    )
    if (!depose.ok) throw new Error(depose.erreur.message)
    return preparerApercu3d(depose.valeur.ressourceId, {
      depot,
      stockage,
      tessellateur,
    })
  }

  it('s’arrête à la première déflexion qui tient dans le budget', async () => {
    // La grande majorité des pièces passe du premier coup : dégrader tout le
    // monde pour les rares assemblages complets serait un mauvais échange.
    const tessellateur = tessellateurRegle(new Map([[0.001, 100]]))

    const resultat = await deposerPuisPreparer(tessellateur)

    expect(resultat.ok).toBe(true)
    expect(tessellateur.deflexionsEssayees).toEqual([0.001])
  })

  it('allège tant que le budget est dépassé', async () => {
    const tessellateur = tessellateurRegle(
      new Map([
        [0.001, BUDGET_TRIANGLES + 1],
        [0.005, BUDGET_TRIANGLES + 1],
        [0.02, 1000],
        [0.05, 10],
      ]),
    )

    const resultat = await deposerPuisPreparer(tessellateur)

    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return

    expect(tessellateur.deflexionsEssayees).toEqual([0.001, 0.005, 0.02])
    expect(resultat.valeur.deflexion).toBe(0.02)
    expect(resultat.valeur.triangles).toBe(1000)
  })

  it('garde le dernier maillage même s’il dépasse encore', async () => {
    // Le budget est un objectif, pas un interdit : un assemblage lourd mais
    // affichable vaut mieux qu'un écran qui annonce un échec.
    const trop = BUDGET_TRIANGLES + 5
    const tessellateur = tessellateurRegle(
      new Map([
        [0.001, trop],
        [0.005, trop],
        [0.02, trop],
        [0.05, trop],
      ]),
    )

    const resultat = await deposerPuisPreparer(tessellateur)

    expect(resultat.ok).toBe(true)
    if (!resultat.ok) return
    expect(resultat.valeur.deflexion).toBe(0.05)
    expect(resultat.valeur.triangles).toBe(trop)
  })
})
