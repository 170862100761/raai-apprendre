'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/noyau/prisma'
import { identifiant, type IdentifiantApprenant, type IdentifiantLecon } from '@/noyau/identifiants'
import { enregistrerLecture } from '@/domaines/catalogue'
import { peut } from '@/domaines/identite'
import { sessionCourante } from '../../_session'

const Entree = z.object({
  leconId: z.string().uuid(),
  position: z.number().int().min(0).max(10_000),
  terminee: z.boolean(),
})

export type EtatLecture = { readonly enregistre: boolean }

export async function marquerLecture(
  _precedent: EtatLecture,
  donnees: FormData,
): Promise<EtatLecture> {
  // 1. Authentifier
  const session = await sessionCourante()
  if (session.sujetId === null) return { enregistre: false }

  // 2. Valider
  const entree = Entree.safeParse({
    leconId: donnees.get('leconId'),
    position: Number(donnees.get('position')),
    terminee: donnees.get('terminee') === 'true',
  })
  if (!entree.success) return { enregistre: false }

  // 3. Autoriser
  const apprenantId = session.sujetId as IdentifiantApprenant
  if (!peut(session, 'progression.lire_la_sienne', { apprenantId }).autorise) {
    return { enregistre: false }
  }
  if (!session.etablissementId) return { enregistre: false }

  // 4. Exécuter
  await enregistrerLecture(
    prisma,
    apprenantId,
    identifiant<IdentifiantLecon>(entree.data.leconId),
    session.etablissementId,
    entree.data.position,
    entree.data.terminee,
  )

  // 5. Invalider — le tableau de bord change d'action prioritaire.
  revalidatePath('/aujourdhui')

  // 6. Auditer — arrivera avec le module `audit`. Marquer une lecture n'est pas
  //    une action sensible : ni note, ni permission, ni donnée personnelle.

  return { enregistre: true }
}
