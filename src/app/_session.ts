import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@/noyau/prisma'
import { COOKIE_APPRENANT, COOKIE_COMPTE, verifierJeton } from '@/noyau/cookie-session'
import { identifiant, type IdentifiantCompte, type JetonSession } from '@/noyau/identifiants'
import {
  depotIdentitePrisma,
  resoudreSession,
  SESSION_ANONYME,
  type Session,
} from '@/domaines/identite'

/**
 * Pont entre l'App Router et le module `identite`.
 *
 * C'est le dernier endroit où l'on manipule des cookies. Tout ce qui est en
 * aval — pages, composants, cas d'usage — reçoit un `Session` et ne sait pas
 * d'où il vient.
 */

const depot = depotIdentitePrisma(prisma)

export async function sessionCourante(): Promise<Session> {
  const secret = process.env.SECRET_SESSION_APPRENANT
  if (!secret) return SESSION_ANONYME

  const bocal = await cookies()

  const jeton = await verifierJeton(bocal.get(COOKIE_APPRENANT)?.value, secret)

  // Supabase n'est pas branché : le cookie de compte existe dans le contrat
  // mais aucun JWT n'est encore vérifié. Le jour où il l'est, seule cette
  // ligne change — le reste de l'application ne bouge pas.
  const compteId = lireCompteId(bocal.get(COOKIE_COMPTE)?.value)

  return resoudreSession(
    {
      compteId,
      jetonApprenant: jeton ? identifiant<JetonSession>(jeton) : null,
    },
    depot,
  )
}

/** Pour les pages qui n'ont aucun sens sans session. */
export async function exigerSession(): Promise<Session> {
  const session = await sessionCourante()
  if (session.sujetId === null) redirect('/connexion')
  return session
}

/**
 * À remplacer par la vérification du JWT Supabase quand le compte sera ouvert.
 * En attendant, renvoyer `null` est le comportement sûr : aucun compte adulte
 * ne peut être usurpé par un cookie fabriqué à la main.
 */
function lireCompteId(_valeur: string | undefined): IdentifiantCompte | null {
  return null
}
