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

export type StatutTraitement = 'en_attente' | 'en_cours' | 'pret' | 'echoue'

export type RessourceStockee = {
  readonly id: string
  readonly etablissementId: IdentifiantEtablissement | null
  readonly nom: string
  readonly typeMime: string
  readonly cheminStockage: string
  /** Chemin du GLB pré-tessellé. `null` tant qu'il n'existe pas. */
  readonly cheminApercu: string | null
  readonly tailleOctets: number
  readonly statutTraitement: StatutTraitement
}

export type RessourceListee = {
  readonly id: string
  readonly nom: string
  readonly typeMime: string
}

export interface DepotMediatheque {
  /** Les ressources d'un établissement, pour la recherche et la médiathèque. */
  ressourcesDeLEtablissement(
    etablissementId: IdentifiantEtablissement,
  ): Promise<readonly RessourceListee[]>

  enregistrer(entree: {
    etablissementId: IdentifiantEtablissement
    nom: string
    typeMime: string
    cheminStockage: string
    tailleOctets: number
    /**
     * `en_attente` quand un aperçu reste à produire, `pret` sinon. C'est
     * l'appelant qui tranche, parce que lui seul sait si un travail suivra —
     * un statut « en attente » que rien ne fait avancer est pire qu'absent.
     */
    statutTraitement: StatutTraitement
  }): Promise<string>

  /** `null` si inconnue ou hors périmètre — la RLS ne distingue pas les deux. */
  charger(id: string): Promise<RessourceStockee | null>

  /** Aperçu produit : chemin et statut changent d'un seul mouvement. */
  enregistrerApercu(id: string, cheminApercu: string): Promise<void>

  /**
   * Aperçu impossible. La ressource reste téléchargeable : un STEP que nous ne
   * savons pas tesseller garde toute sa valeur ouvert dans un logiciel de CAO.
   */
  marquerTraitement(id: string, statut: StatutTraitement): Promise<void>
}
