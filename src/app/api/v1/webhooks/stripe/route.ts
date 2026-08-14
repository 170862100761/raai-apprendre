import { NextResponse, type NextRequest } from 'next/server'
import { traiterEvenementPaiement } from '@/domaines/facturation'
import { facturationConfiguree } from '../../../../_facturation'

/**
 * Webhook Stripe (doc 06 §API) : signature vérifiée, idempotent.
 *
 * Un doublon renvoie 200 — Stripe rejoue, c'est normal, et un autre code le
 * ferait rejouer sans fin. Seule une signature invalide vaut 400 : c'est une
 * attaque ou une mauvaise configuration, dans les deux cas il faut le voir.
 */

export const runtime = 'nodejs'

export async function POST(requete: NextRequest) {
  const facturation = facturationConfiguree()
  if (!facturation) return new NextResponse(null, { status: 404 })

  const signature = requete.headers.get('stripe-signature')
  if (!signature) return new NextResponse(null, { status: 400 })

  // Le corps BRUT, pas le JSON : la signature porte sur les octets exacts,
  // et un aller-retour de sérialisation la casserait.
  const corps = await requete.text()

  try {
    await traiterEvenementPaiement(corps, signature, facturation)
  } catch {
    return new NextResponse(null, { status: 400 })
  }

  return new NextResponse(null, { status: 200 })
}
