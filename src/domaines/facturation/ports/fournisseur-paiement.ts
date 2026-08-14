import type { IdentifiantEtablissement } from '@/noyau/identifiants'
import type { EvenementPaiement } from '../domaine/abonnement'

/**
 * Le prestataire de paiement, vu du domaine. Stripe derrière, mais aucun type
 * Stripe ne franchit cette interface : le jour où le marché public impose un
 * autre prestataire, seul l'adaptateur change.
 */
export interface FournisseurPaiement {
  /**
   * Ouvre une session de souscription ; renvoie l'URL où envoyer
   * l'administrateur, et le client — créé au passage s'il n'existait pas.
   * L'appelant DOIT persister ce client : c'est par lui que le webhook
   * retrouvera l'établissement.
   */
  creerSessionAbonnement(entree: {
    etablissementId: IdentifiantEtablissement
    /** Client déjà connu du prestataire, s'il existe. */
    stripeClientId: string | null
    sieges: number
    urlSucces: string
    urlAnnulation: string
  }): Promise<{ url: string; stripeClientId: string }>

  /** Portail de gestion (moyen de paiement, factures, résiliation). */
  creerSessionPortail(entree: {
    stripeClientId: string
    urlRetour: string
  }): Promise<{ url: string }>

  /**
   * Vérifie la signature et normalise un webhook. `null` pour un événement
   * authentique mais qui ne nous concerne pas — l'ignorer est un succès, pas
   * une erreur. Une signature invalide, elle, jette : c'est une attaque ou
   * une mauvaise configuration, jamais un cas nominal.
   */
  lireEvenement(corps: string, signature: string): Promise<EvenementPaiement | null>
}
