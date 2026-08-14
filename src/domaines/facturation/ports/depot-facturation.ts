import type { IdentifiantEtablissement } from '@/noyau/identifiants'
import type { Abonnement, EvenementPaiement } from '../domaine/abonnement'

export interface DepotFacturation {
  /** L'abonnement d'un établissement — `inexistant` s'il n'y en a jamais eu. */
  chargerAbonnement(
    etablissementId: IdentifiantEtablissement,
  ): Promise<Abonnement & { readonly stripeClientId: string | null }>

  /** Mémorise le client Stripe dès sa création, avant même la souscription :
   *  un client sans abonnement est normal, l'inverse est une incohérence. */
  enregistrerClient(
    etablissementId: IdentifiantEtablissement,
    stripeClientId: string,
  ): Promise<void>

  /**
   * Applique un événement s'il est nouveau. Renvoie `false` si l'événement
   * avait déjà été traité — Stripe rejoue, c'est normal, et c'est cette
   * réponse qui rend le webhook idempotent.
   */
  appliquerEvenement(evenement: EvenementPaiement): Promise<boolean>

  /** Les élèves inscrits, pour la comparaison aux sièges payés. */
  compterInscrits(etablissementId: IdentifiantEtablissement): Promise<number>
}
