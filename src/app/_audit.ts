import 'server-only'
import { headers } from 'next/headers'
import { prisma } from '@/noyau/prisma'
import { journalPrisma, tracer, type ActionAuditee, type Cible } from '@/domaines/audit'
import type { Session } from '@/domaines/identite'

/**
 * Pont entre l'App Router et le module `audit`.
 *
 * Une seule fonction, appelée à l'étape 6 de chaque Server Action sensible.
 * L'adresse IP est lue ici — c'est le seul endroit qui a accès aux en-têtes —
 * et tronquée par le domaine avant d'atteindre la base.
 */

const journal = journalPrisma(prisma)

async function adresse(): Promise<string | null> {
  try {
    const entetes = await headers()
    // Vercel pose `x-forwarded-for` ; en local il n'y a rien, et c'est très bien.
    return entetes.get('x-forwarded-for') ?? entetes.get('x-real-ip')
  } catch {
    return null
  }
}

export async function auditer(
  action: ActionAuditee,
  session: Session,
  cible: Cible,
): Promise<void> {
  await tracer(
    action,
    {
      sujetId: session.sujetId,
      sujetType:
        session.origine === 'compte'
          ? 'compte'
          : session.origine === 'jeton_apprenant'
            ? 'apprenant'
            : 'anonyme',
      // Le rôle réellement exercé, pas celui du compte : un enseignant qui est
      // aussi responsable pédagogique n'agit qu'avec un seul chapeau à la fois.
      roleEffectif: session.attributions.map((a) => a.role).join(',') || 'aucun',
      etablissementId: session.etablissementId,
      ip: await adresse(),
    },
    cible,
    journal,
  )
}

/**
 * Trace une action tentée sans session valide — typiquement un échec de
 * connexion. Sans elle, une attaque par force brute ne laisserait aucune trace,
 * ce qui est exactement le cas où l'on veut en avoir une.
 */
export async function auditerAnonyme(
  action: ActionAuditee,
  cible: Cible,
  etablissementId: string | null = null,
): Promise<void> {
  await tracer(
    action,
    {
      sujetId: null,
      sujetType: 'anonyme',
      roleEffectif: 'aucun',
      etablissementId,
      ip: await adresse(),
    },
    cible,
    journal,
  )
}
