import type { IdentifiantEtablissement } from '@/noyau/identifiants'

/**
 * Le stockage d'objets, vu du domaine.
 *
 * Supabase Storage en production, disque local en développement. Le port ne
 * connaît ni l'un ni l'autre : il parle de chemins opaques et de flux d'octets.
 */
export interface StockageObjet {
  ecrire(chemin: string, contenu: Uint8Array, typeMime: string): Promise<void>
  lire(chemin: string): Promise<Uint8Array | null>
  supprimer(chemin: string): Promise<void>
}

export type RessourceStockee = {
  readonly id: string
  readonly etablissementId: IdentifiantEtablissement | null
  readonly nom: string
  readonly typeMime: string
  readonly cheminStockage: string
  readonly tailleOctets: number
  readonly statutTraitement: string
}

export interface DepotMediatheque {
  enregistrer(entree: {
    etablissementId: IdentifiantEtablissement
    nom: string
    typeMime: string
    cheminStockage: string
    tailleOctets: number
  }): Promise<string>

  /** `null` si inconnue ou hors périmètre — la RLS ne distingue pas les deux. */
  charger(id: string): Promise<RessourceStockee | null>
}
