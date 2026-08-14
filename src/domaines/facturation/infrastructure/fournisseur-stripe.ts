import 'server-only'
import Stripe from 'stripe'
import type { IdentifiantEtablissement } from '@/noyau/identifiants'
import { traduireStatutStripe, type EvenementPaiement } from '../domaine/abonnement'
import type { FournisseurPaiement } from '../ports/fournisseur-paiement'

/**
 * Adaptateur Stripe. Seul fichier du dépôt qui connaisse les types Stripe —
 * la clé arrive en paramètre, jamais lue ici : c'est l'appelant qui sait si
 * la facturation est configurée, et `server-only` garantit qu'aucun composant
 * client n'embarque ce module ni la clé qu'on lui passe.
 */

/** Les seuls événements qui changent notre projection. Le reste — factures,
 *  paiements intermédiaires — appartient au tableau de bord Stripe. */
const EVENEMENTS_SUIVIS: ReadonlySet<string> = new Set([
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
])

export function fournisseurStripe(configuration: {
  cleSecrete: string
  secretWebhook: string
  /** Le tarif « siège » (`price_…`), créé dans le tableau de bord Stripe. */
  prixSiege: string
}): FournisseurPaiement {
  const stripe = new Stripe(configuration.cleSecrete)

  async function clientPour(
    etablissementId: IdentifiantEtablissement,
    existant: string | null,
  ): Promise<string> {
    if (existant) return existant
    // Le lien client → établissement vit dans les métadonnées Stripe ET dans
    // notre table : si l'une des deux se perd, l'autre permet de réconcilier.
    const client = await stripe.customers.create({
      metadata: { etablissement_id: etablissementId },
    })
    return client.id
  }

  return {
    async creerSessionAbonnement(entree) {
      const clientId = await clientPour(entree.etablissementId, entree.stripeClientId)
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: clientId,
        line_items: [{ price: configuration.prixSiege, quantity: entree.sieges }],
        subscription_data: {
          metadata: { etablissement_id: entree.etablissementId },
        },
        success_url: entree.urlSucces,
        cancel_url: entree.urlAnnulation,
      })
      if (!session.url) throw new Error('Session Stripe créée sans URL')
      return { url: session.url, stripeClientId: clientId }
    },

    async creerSessionPortail(entree) {
      const session = await stripe.billingPortal.sessions.create({
        customer: entree.stripeClientId,
        return_url: entree.urlRetour,
      })
      return { url: session.url }
    },

    async lireEvenement(corps, signature) {
      // Jette si la signature est invalide — c'est voulu, la route en fait un 400.
      const evenement = await stripe.webhooks.constructEventAsync(
        corps,
        signature,
        configuration.secretWebhook,
      )
      if (!EVENEMENTS_SUIVIS.has(evenement.type)) return null

      const abonnement = evenement.data.object as Stripe.Subscription
      const article = abonnement.items.data[0]

      const normalise: EvenementPaiement = {
        id: evenement.id,
        stripeClientId:
          typeof abonnement.customer === 'string'
            ? abonnement.customer
            : abonnement.customer.id,
        stripeAbonnementId: abonnement.id,
        // Une suppression est une annulation, quel que soit le statut porté.
        statut:
          evenement.type === 'customer.subscription.deleted'
            ? 'annulee'
            : traduireStatutStripe(abonnement.status),
        sieges: article?.quantity ?? 0,
        periodeFinLe: article?.current_period_end
          ? new Date(article.current_period_end * 1000)
          : null,
      }
      return normalise
    },
  }
}
