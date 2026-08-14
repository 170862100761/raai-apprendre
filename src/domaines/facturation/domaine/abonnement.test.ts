import { describe, expect, it } from 'vitest'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantEtablissement } from '@/noyau/identifiants'
import { siegesManquants, traduireStatutStripe, type Abonnement } from './abonnement'

const abonnement = (statut: Abonnement['statut'], sieges: number): Abonnement => ({
  etablissementId: identifiant<IdentifiantEtablissement>('e1'),
  statut,
  sieges,
  periodeFinLe: null,
})

describe('traduireStatutStripe', () => {
  it('un essai est un abonnement qui fonctionne', () => {
    expect(traduireStatutStripe('trialing')).toBe('active')
    expect(traduireStatutStripe('active')).toBe('active')
  })

  it('une annulation, sous ses deux formes Stripe, vaut annulée', () => {
    expect(traduireStatutStripe('canceled')).toBe('annulee')
    expect(traduireStatutStripe('incomplete_expired')).toBe('annulee')
  })

  it('un statut inconnu ne vaut JAMAIS un paiement acquis', () => {
    expect(traduireStatutStripe('past_due')).toBe('impayee')
    expect(traduireStatutStripe('unpaid')).toBe('impayee')
    expect(traduireStatutStripe('statut_de_2031')).toBe('impayee')
  })
})

describe('siegesManquants', () => {
  it('zéro quand les sièges couvrent les inscrits', () => {
    expect(siegesManquants(abonnement('active', 30), 25)).toBe(0)
    expect(siegesManquants(abonnement('active', 30), 30)).toBe(0)
  })

  it('compte le dépassement, sans jamais être négatif', () => {
    expect(siegesManquants(abonnement('active', 30), 33)).toBe(3)
  })

  it('sans abonnement actif, tous les inscrits sont découverts', () => {
    expect(siegesManquants(abonnement('inexistant', 0), 12)).toBe(12)
    expect(siegesManquants(abonnement('annulee', 30), 12)).toBe(12)
    expect(siegesManquants(abonnement('impayee', 30), 12)).toBe(12)
  })
})
