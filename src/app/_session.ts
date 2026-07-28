import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@/noyau/prisma'
import { COOKIE_APPRENANT, COOKIE_COMPTE, verifierJeton } from '@/noyau/cookie-session'
import { identifiant, type JetonSession } from '@/noyau/identifiants'
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

  const jetonApprenant = await verifierJeton(bocal.get(COOKIE_APPRENANT)?.value, secret)
  const jetonCompte = await verifierJeton(bocal.get(COOKIE_COMPTE)?.value, secret)

  // TRANSITOIRE : tant que Supabase Auth n'est pas ouvert, le jeton de compte
  // est un jeton maison, vérifié en base exactement comme celui d'un élève.
  // Le jour où Supabase arrive, seules ces trois lignes changent — ni les
  // écrans ni les autorisations ne bougent.
  const compteId = jetonCompte
    ? await depot.resoudreJetonCompte(identifiant<JetonSession>(jetonCompte))
    : null

  return resoudreSession(
    {
      compteId,
      jetonApprenant: jetonApprenant ? identifiant<JetonSession>(jetonApprenant) : null,
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
