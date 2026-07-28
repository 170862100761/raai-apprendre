import { beforeEach, describe, expect, it } from 'vitest'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantEtablissement } from '@/noyau/identifiants'
import { servirMedia, televerser } from './televerser'
import { TYPES_ACCEPTES } from '../domaine/type-fichier'
import type { DepotMediatheque, RessourceStockee, StockageObjet } from '../ports/stockage'

const ETAB = identifiant<IdentifiantEtablissement>('etab-a')

const PNG = (taille = 2048) => {
  const contenu = new Uint8Array(taille)
  contenu.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  return contenu
}

class StockageDouble implements StockageObjet {
  fichiers = new Map<string, Uint8Array>()
  async ecrire(chemin: string, contenu: Uint8Array) {
    this.fichiers.set(chemin, contenu)
  }
  async lire(chemin: string) {
    return this.fichiers.get(chemin) ?? null
  }
  async supprimer(chemin: string) {
    this.fichiers.delete(chemin)
  }
}

class DepotDouble implements DepotMediatheque {
  ressources = new Map<string, RessourceStockee>()
  compteur = 0

  async enregistrer(entree: Parameters<DepotMediatheque['enregistrer']>[0]) {
    const id = `ressource-${++this.compteur}`
    this.ressources.set(id, { id, statutTraitement: 'pret', ...entree })
    return id
  }
  async charger(id: string) {
    return this.ressources.get(id) ?? null
  }
}

let stockage: StockageDouble
let depot: DepotDouble
let n: number

beforeEach(() => {
  stockage = new StockageDouble()
  depot = new DepotDouble()
  n = 0
})

const deps = () => ({ depot, stockage, identifiant: () => `uuid-${++n}` })

const affichable = (mime: string) =>
  TYPES_ACCEPTES.find((t) => t.mime === mime)?.affichable ?? false

describe('téléversement', () => {
  it('accepte une image et l’enregistre', async () => {
    const r = await televerser(
      { etablissementId: ETAB, nom: 'schema.png', contenu: PNG() },
      deps(),
    )

    expect(r.ok).toBe(true)
    expect(r.ok && r.valeur.typeMime).toBe('image/png')
    expect(stockage.fichiers.size).toBe(1)
  })

  it('range le fichier sous un chemin en UUID, pas sous son nom', async () => {
    await televerser(
      { etablissementId: ETAB, nom: '../../etc/passwd.png', contenu: PNG() },
      deps(),
    )

    // Un nom d'utilisateur dans un chemin de stockage est une traversée de
    // répertoire en puissance.
    const [chemin] = [...stockage.fichiers.keys()]
    expect(chemin).toBe('etab-a/uuid-1')
    expect(chemin).not.toContain('passwd')
  })

  it('n’écrit RIEN quand le fichier est refusé', async () => {
    // Écrire puis vérifier laisserait des fichiers refusés sur le disque.
    const r = await televerser(
      { etablissementId: ETAB, nom: 'virus.exe', contenu: PNG() },
      deps(),
    )

    expect(r.ok).toBe(false)
    expect(stockage.fichiers.size).toBe(0)
    expect(depot.ressources.size).toBe(0)
  })

  it('refuse un fichier dont le contenu dément l’extension', async () => {
    const html = new TextEncoder().encode('<html><script>alert(1)</script>')
    const r = await televerser(
      { etablissementId: ETAB, nom: 'schema.png', contenu: new Uint8Array(html) },
      deps(),
    )

    expect(r.ok).toBe(false)
    expect(stockage.fichiers.size).toBe(0)
  })

  it('assainit le nom conservé', async () => {
    const r = await televerser(
      { etablissementId: ETAB, nom: 'Réglage du vérin.png', contenu: PNG() },
      deps(),
    )
    expect(r.ok && r.valeur.nom).toBe('Reglage-du-verin.png')
  })
})

describe('service des médias', () => {
  it('rend une image affichable en ligne', async () => {
    const depose = await televerser(
      { etablissementId: ETAB, nom: 'schema.png', contenu: PNG() },
      deps(),
    )
    if (!depose.ok) throw new Error('dépôt attendu')

    const r = await servirMedia(depose.valeur.ressourceId, { depot, stockage }, affichable)
    expect(r.ok).toBe(true)
    expect(r.ok && r.valeur.affichable).toBe(true)
    expect(r.ok && r.valeur.typeMime).toBe('image/png')
  })

  it('marque un PDF comme non affichable', async () => {
    const pdf = new Uint8Array(1024)
    pdf.set([0x25, 0x50, 0x44, 0x46, 0x2d])
    const depose = await televerser(
      { etablissementId: ETAB, nom: 'cours.pdf', contenu: pdf },
      deps(),
    )
    if (!depose.ok) throw new Error('dépôt attendu')

    // Un PDF peut contenir du JavaScript : servi en téléchargement, il ne
    // s'exécute pas dans notre origine.
    const r = await servirMedia(depose.valeur.ressourceId, { depot, stockage }, affichable)
    expect(r.ok && r.valeur.affichable).toBe(false)
  })

  it('renvoie « introuvable » pour un identifiant inconnu', async () => {
    const r = await servirMedia('inexistant', { depot, stockage }, affichable)
    expect(r.ok).toBe(false)
  })

  it('renvoie « introuvable » quand la ligne existe mais pas le fichier', async () => {
    // Cas réel : base restaurée sans le stockage. On ne rend pas une erreur 500.
    const id = await depot.enregistrer({
      etablissementId: ETAB,
      nom: 'perdu.png',
      typeMime: 'image/png',
      cheminStockage: 'etab-a/absent',
      tailleOctets: 10,
    })
    const r = await servirMedia(id, { depot, stockage }, affichable)
    expect(r.ok).toBe(false)
  })
})
