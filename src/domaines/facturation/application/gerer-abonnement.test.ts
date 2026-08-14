import { describe, expect, it } from 'vitest'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantEtablissement } from '@/noyau/identifiants'
import type { EvenementPaiement, StatutAbonnement } from '../domaine/abonnement'
import type { DepotFacturation } from '../ports/depot-facturation'
import type { FournisseurPaiement } from '../ports/fournisseur-paiement'
import {
  consulterAbonnement,
  demarrerSouscription,
  ouvrirPortail,
  traiterEvenementPaiement,
} from './gerer-abonnement'

const ETAB = identifiant<IdentifiantEtablissement>('e1')

class DepotDouble implements DepotFacturation {
  statut: StatutAbonnement = 'inexistant'
  sieges = 0
  stripeClientId: string | null = null
  inscrits = 0
  traites = new Set<string>()
  appliques: EvenementPaiement[] = []

  async chargerAbonnement(etablissementId: IdentifiantEtablissement) {
    return {
      etablissementId,
      statut: this.statut,
      sieges: this.sieges,
      periodeFinLe: null as Date | null,
      stripeClientId: this.stripeClientId,
    }
  }
  async enregistrerClient(_: IdentifiantEtablissement, clientId: string) {
    this.stripeClientId = clientId
  }
  async appliquerEvenement(evenement: EvenementPaiement) {
    if (this.traites.has(evenement.id)) return false
    this.traites.add(evenement.id)
    this.appliques.push(evenement)
    return true
  }
  async compterInscrits() {
    return this.inscrits
  }
}

const EVENEMENT: EvenementPaiement = {
  id: 'evt_1',
  stripeClientId: 'cus_1',
  stripeAbonnementId: 'sub_1',
  statut: 'active',
  sieges: 25,
  periodeFinLe: null,
}

class FournisseurDouble implements FournisseurPaiement {
  demandes: { sieges: number }[] = []
  evenement: EvenementPaiement | null = EVENEMENT

  async creerSessionAbonnement(entree: { sieges: number }) {
    this.demandes.push({ sieges: entree.sieges })
    return { url: 'https://stripe.example/session', stripeClientId: 'cus_neuf' }
  }
  async creerSessionPortail() {
    return { url: 'https://stripe.example/portail' }
  }
  async lireEvenement() {
    return this.evenement
  }
}

describe('consulterAbonnement', () => {
  it('rapproche sièges payés et inscrits', async () => {
    const depot = new DepotDouble()
    depot.statut = 'active'
    depot.sieges = 20
    depot.inscrits = 23

    const resultat = await consulterAbonnement(ETAB, { depot })
    expect(resultat.ok && resultat.valeur.siegesManquants).toBe(3)
  })
})

describe('demarrerSouscription', () => {
  const entree = { etablissementId: ETAB, urlSucces: 'https://s', urlAnnulation: 'https://a' }

  it('propose autant de sièges que d’inscrits, au moins un', async () => {
    const depot = new DepotDouble()
    const fournisseur = new FournisseurDouble()
    depot.inscrits = 28

    const resultat = await demarrerSouscription(entree, { depot, fournisseur })
    expect(resultat.ok).toBe(true)
    expect(fournisseur.demandes).toEqual([{ sieges: 28 }])
    // Le client créé au passage est persisté : c'est lui que le webhook cherchera.
    expect(depot.stripeClientId).toBe('cus_neuf')

    depot.inscrits = 0
    await demarrerSouscription(entree, { depot, fournisseur })
    expect(fournisseur.demandes[1]).toEqual({ sieges: 1 })
  })

  it('refuse une seconde souscription sur un abonnement actif', async () => {
    const depot = new DepotDouble()
    depot.statut = 'active'
    const resultat = await demarrerSouscription(entree, {
      depot,
      fournisseur: new FournisseurDouble(),
    })
    expect(!resultat.ok && resultat.erreur.code).toBe('conflit')
  })
})

describe('ouvrirPortail', () => {
  it('sans client Stripe, il n’y a rien à gérer', async () => {
    const resultat = await ouvrirPortail(
      { etablissementId: ETAB, urlRetour: 'https://r' },
      { depot: new DepotDouble(), fournisseur: new FournisseurDouble() },
    )
    expect(!resultat.ok && resultat.erreur.code).toBe('introuvable')
  })
})

describe('traiterEvenementPaiement', () => {
  it('applique une seule fois : le rejeu de Stripe est un succès silencieux', async () => {
    const depot = new DepotDouble()
    const fournisseur = new FournisseurDouble()

    const premier = await traiterEvenementPaiement('corps', 'sig', { depot, fournisseur })
    const rejeu = await traiterEvenementPaiement('corps', 'sig', { depot, fournisseur })

    expect(premier.applique).toBe(true)
    expect(rejeu.applique).toBe(false)
    expect(depot.appliques).toHaveLength(1)
  })

  it('un événement hors sujet est ignoré sans erreur', async () => {
    const fournisseur = new FournisseurDouble()
    fournisseur.evenement = null
    const resultat = await traiterEvenementPaiement('corps', 'sig', {
      depot: new DepotDouble(),
      fournisseur,
    })
    expect(resultat.applique).toBe(false)
  })
})
