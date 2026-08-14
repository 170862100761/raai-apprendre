/**
 * L'abonnement d'un établissement, par sièges.
 *
 * Stripe est la source de vérité du paiement : ce domaine ne calcule pas de
 * prix et ne connaît pas de carte bancaire. Il ne porte que les deux règles
 * qui appartiennent au métier — traduire l'état Stripe en état qui a un sens
 * ici, et dire si les sièges payés couvrent les élèves inscrits.
 */
import type { IdentifiantEtablissement } from '@/noyau/identifiants'

export type StatutAbonnement = 'inexistant' | 'active' | 'impayee' | 'annulee'

export type Abonnement = {
  readonly etablissementId: IdentifiantEtablissement
  readonly statut: StatutAbonnement
  readonly sieges: number
  readonly periodeFinLe: Date | null
}

/**
 * Traduction des statuts Stripe vers les nôtres.
 *
 * Quatre états et non huit : l'administrateur d'établissement n'a que trois
 * questions — ai-je un abonnement, est-il payé, jusqu'à quand. `trialing`
 * vaut `active` : une période d'essai EST un abonnement qui fonctionne.
 * `past_due` et `unpaid` valent `impayee` : la nuance de relance appartient à
 * Stripe, pas à nos écrans. Un statut inconnu — Stripe en ajoutera — vaut
 * `impayee` plutôt qu'`active` : en cas de doute, on ne considère jamais un
 * paiement comme acquis.
 */
export function traduireStatutStripe(statut: string): StatutAbonnement {
  switch (statut) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'canceled':
    case 'incomplete_expired':
      return 'annulee'
    default:
      return 'impayee'
  }
}

/**
 * Les sièges couvrent-ils les inscrits ?
 *
 * Règle volontairement non bloquante : un dépassement s'affiche, il
 * n'empêche jamais un élève de travailler. Couper l'accès d'un mineur pour
 * une question de facturation serait une décision commerciale déguisée en
 * règle technique — c'est à l'établissement de régulariser, pas à l'élève
 * de payer le décalage.
 */
export function siegesManquants(abonnement: Abonnement, inscrits: number): number {
  if (abonnement.statut !== 'active') return inscrits
  return Math.max(0, inscrits - abonnement.sieges)
}

/** Événement de paiement normalisé : ce que le webhook Stripe devient une
 *  fois la frontière passée. L'identifiant Stripe est la clé d'idempotence. */
export type EvenementPaiement = {
  readonly id: string
  readonly stripeClientId: string
  readonly stripeAbonnementId: string
  readonly statut: StatutAbonnement
  readonly sieges: number
  readonly periodeFinLe: Date | null
}
