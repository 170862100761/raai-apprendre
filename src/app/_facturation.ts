import 'server-only'
import { lireEnvironnement } from '@/noyau/environnement'
import { prisma } from '@/noyau/prisma'
import {
  depotFacturationPrisma,
  fournisseurStripe,
  type DepotFacturation,
  type FournisseurPaiement,
} from '@/domaines/facturation'

/**
 * Pont entre l'App Router et le module `facturation`.
 *
 * La facturation est optionnelle tant que Stripe n'est pas configuré — même
 * logique de bascule que la connexion des adultes : les écrans demandent ici,
 * et personne d'autre ne lit les variables Stripe.
 */

export type Facturation = {
  readonly depot: DepotFacturation
  readonly fournisseur: FournisseurPaiement
}

export function facturationConfiguree(): Facturation | null {
  const env = lireEnvironnement()
  if (!env.STRIPE_SECRET_KEY || !env.STRIPE_WEBHOOK_SECRET || !env.STRIPE_PRIX_SIEGE) {
    return null
  }
  return {
    depot: depotFacturationPrisma(prisma),
    fournisseur: fournisseurStripe({
      cleSecrete: env.STRIPE_SECRET_KEY,
      secretWebhook: env.STRIPE_WEBHOOK_SECRET,
      prixSiege: env.STRIPE_PRIX_SIEGE,
    }),
  }
}
