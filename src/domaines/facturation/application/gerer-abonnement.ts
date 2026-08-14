import { succes, type Resultat } from '@/noyau/resultat'
import type { IdentifiantEtablissement } from '@/noyau/identifiants'
import { siegesManquants, type Abonnement } from '../domaine/abonnement'
import type { DepotFacturation } from '../ports/depot-facturation'
import type { FournisseurPaiement } from '../ports/fournisseur-paiement'

export type Dependances = {
  readonly depot: DepotFacturation
  readonly fournisseur: FournisseurPaiement
}

export type EtatAbonnement = Abonnement & {
  readonly inscrits: number
  readonly siegesManquants: number
}

/** L'état affiché à l'administrateur : l'abonnement ET ce qu'il couvre. */
export async function consulterAbonnement(
  etablissementId: IdentifiantEtablissement,
  { depot }: Pick<Dependances, 'depot'>,
): Promise<Resultat<EtatAbonnement>> {
  const abonnement = await depot.chargerAbonnement(etablissementId)
  const inscrits = await depot.compterInscrits(etablissementId)
  return succes({
    etablissementId: abonnement.etablissementId,
    statut: abonnement.statut,
    sieges: abonnement.sieges,
    periodeFinLe: abonnement.periodeFinLe,
    inscrits,
    siegesManquants: siegesManquants(abonnement, inscrits),
  })
}

/**
 * Démarre une souscription : le nombre de sièges proposé est le nombre
 * d'inscrits — on paie pour les élèves qu'on a, l'ajustement fin se fait
 * ensuite dans le portail.
 */
export async function demarrerSouscription(
  entree: {
    readonly etablissementId: IdentifiantEtablissement
    readonly urlSucces: string
    readonly urlAnnulation: string
  },
  { depot, fournisseur }: Dependances,
): Promise<Resultat<{ url: string }>> {
  const abonnement = await depot.chargerAbonnement(entree.etablissementId)
  if (abonnement.statut === 'active') {
    return {
      ok: false,
      erreur: {
        code: 'conflit',
        message: 'Un abonnement est déjà actif. Passe par « Gérer l’abonnement ».',
      },
    }
  }

  const inscrits = await depot.compterInscrits(entree.etablissementId)
  const { url, stripeClientId } = await fournisseur.creerSessionAbonnement({
    etablissementId: entree.etablissementId,
    stripeClientId: abonnement.stripeClientId,
    // Au moins un siège : une souscription à zéro siège ne veut rien dire,
    // et un établissement qui s'abonne avant d'importer ses élèves est un
    // cas réel de mise en route.
    sieges: Math.max(1, inscrits),
    urlSucces: entree.urlSucces,
    urlAnnulation: entree.urlAnnulation,
  })

  // Sans cette écriture, le webhook — qui rapproche par client Stripe — ne
  // retrouverait jamais l'établissement, et l'abonnement resterait invisible.
  if (abonnement.stripeClientId !== stripeClientId) {
    await depot.enregistrerClient(entree.etablissementId, stripeClientId)
  }

  return succes({ url })
}

/** Ouvre le portail de gestion — factures, moyen de paiement, résiliation. */
export async function ouvrirPortail(
  entree: { readonly etablissementId: IdentifiantEtablissement; readonly urlRetour: string },
  { depot, fournisseur }: Dependances,
): Promise<Resultat<{ url: string }>> {
  const abonnement = await depot.chargerAbonnement(entree.etablissementId)
  if (!abonnement.stripeClientId) {
    return {
      ok: false,
      erreur: {
        code: 'introuvable',
        message: 'Aucun abonnement à gérer : commence par en souscrire un.',
      },
    }
  }
  const { url } = await fournisseur.creerSessionPortail({
    stripeClientId: abonnement.stripeClientId,
    urlRetour: entree.urlRetour,
  })
  return succes({ url })
}

/**
 * Traite un webhook déjà authentifié. Renvoie `true` si l'événement a été
 * appliqué, `false` s'il était déjà connu — les deux sont des succès HTTP :
 * répondre autre chose qu'un 200 à un doublon ferait rejouer Stripe sans fin.
 */
export async function traiterEvenementPaiement(
  corps: string,
  signature: string,
  { depot, fournisseur }: Dependances,
): Promise<{ applique: boolean }> {
  const evenement = await fournisseur.lireEvenement(corps, signature)
  if (!evenement) return { applique: false }
  return { applique: await depot.appliquerEvenement(evenement) }
}
