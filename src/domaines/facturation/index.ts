/** Surface publique du module `facturation`. */

export {
  siegesManquants,
  traduireStatutStripe,
  type Abonnement,
  type EvenementPaiement,
  type StatutAbonnement,
} from './domaine/abonnement'

export {
  consulterAbonnement,
  demarrerSouscription,
  ouvrirPortail,
  traiterEvenementPaiement,
  type EtatAbonnement,
} from './application/gerer-abonnement'

export type { DepotFacturation } from './ports/depot-facturation'
export type { FournisseurPaiement } from './ports/fournisseur-paiement'

export { depotFacturationPrisma } from './infrastructure/depot-facturation-prisma'
export { fournisseurStripe } from './infrastructure/fournisseur-stripe'
