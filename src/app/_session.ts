import 'server-only'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { prisma } from '@/noyau/prisma'
import { COOKIE_APPRENANT, COOKIE_COMPTE, verifierJeton } from '@/noyau/cookie-session'
import { identifiant, type JetonSession } from '@/noyau/identifiants'
import {
  compteDepuisSupabase,
  configurationSupabase,
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

  // Bascule automatique : dès que Supabase est configuré, c'est lui qui
  // authentifie les adultes. Sinon on retombe sur le jeton maison, transitoire.
  // Aucune des deux voies n'est visible au-delà de cette fonction.
  const configuration = configurationSupabase()

  const compteId = configuration
    ? await compteDepuisSupabase(configuration, {
        lire: () => bocal.getAll().map((c) => ({ name: c.name, value: c.value })),
      })
    : await compteMaison(bocal.get(COOKIE_COMPTE)?.value, secret)

  return resoudreSession(
    {
      compteId,
      jetonApprenant: jetonApprenant ? identifiant<JetonSession>(jetonApprenant) : null,
    },
    depot,
  )
}

/**
 * Chemin TRANSITOIRE, actif tant que Supabase n'est pas configuré.
 * Il disparaîtra avec `compte.mot_de_passe_hash` et `session_compte`.
 */
async function compteMaison(valeur: string | undefined, secret: string) {
  const jeton = await verifierJeton(valeur, secret)
  return jeton ? depot.resoudreJetonCompte(identifiant<JetonSession>(jeton)) : null
}

/** Pour les pages qui n'ont aucun sens sans session. */
export async function exigerSession(): Promise<Session> {
  const session = await sessionCourante()
  if (session.sujetId === null) redirect('/connexion')
  return session
}
