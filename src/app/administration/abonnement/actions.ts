'use server'

import { redirect } from 'next/navigation'
import { peut } from '@/domaines/identite'
import { demarrerSouscription, ouvrirPortail } from '@/domaines/facturation'
import { lireEnvironnement } from '@/noyau/environnement'
import { exigerSession } from '../../_session'
import { auditer } from '../../_audit'
import { facturationConfiguree } from '../../_facturation'

/**
 * Les deux actions redirigent vers Stripe : la carte bancaire ne passe
 * JAMAIS par nos écrans, c'est toute la valeur de Checkout et du portail.
 */

export type EtatFacturation = { readonly erreur?: string }

export async function souscrire(): Promise<EtatFacturation> {
  // 1. Authentifier
  const session = await exigerSession()
  // 2. Valider — pas d'entrée utilisateur ici
  // 3. Autoriser
  if (!session.etablissementId) return { erreur: 'Session sans établissement.' }
  const decision = peut(session, 'etablissement.gerer')
  if (!decision.autorise) return { erreur: decision.motif }

  const facturation = facturationConfiguree()
  if (!facturation) return { erreur: 'La facturation n’est pas configurée.' }

  // 4. Exécuter
  const urlSite = lireEnvironnement().NEXT_PUBLIC_URL_SITE
  const resultat = await demarrerSouscription(
    {
      etablissementId: session.etablissementId,
      urlSucces: `${urlSite}/administration/abonnement?statut=merci`,
      urlAnnulation: `${urlSite}/administration/abonnement`,
    },
    facturation,
  )
  if (!resultat.ok) return { erreur: resultat.erreur.message }

  // 5. Invalider — rien : la page se recharge au retour de Stripe
  // 6. Auditer, avant de quitter le serveur
  await auditer('abonnement.souscrit', session, {
    type: 'etablissement',
    id: session.etablissementId,
  })

  redirect(resultat.valeur.url)
}

export async function gerer(): Promise<EtatFacturation> {
  const session = await exigerSession()
  if (!session.etablissementId) return { erreur: 'Session sans établissement.' }
  const decision = peut(session, 'etablissement.gerer')
  if (!decision.autorise) return { erreur: decision.motif }

  const facturation = facturationConfiguree()
  if (!facturation) return { erreur: 'La facturation n’est pas configurée.' }

  const urlSite = lireEnvironnement().NEXT_PUBLIC_URL_SITE
  const resultat = await ouvrirPortail(
    {
      etablissementId: session.etablissementId,
      urlRetour: `${urlSite}/administration/abonnement`,
    },
    facturation,
  )
  if (!resultat.ok) return { erreur: resultat.erreur.message }

  await auditer('abonnement.gere', session, {
    type: 'etablissement',
    id: session.etablissementId,
  })

  redirect(resultat.valeur.url)
}
