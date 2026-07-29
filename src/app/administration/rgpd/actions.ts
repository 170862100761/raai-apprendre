'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/noyau/prisma'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantApprenant, IdentifiantEtablissement } from '@/noyau/identifiants'
import {
  depotOrganisationPrisma,
  effacerApprenant,
  exporterDossier,
} from '@/domaines/organisation'
import { peut } from '@/domaines/identite'
import { sessionCourante } from '../../_session'
import { auditer } from '../../_audit'

export type EtatRgpd = {
  readonly message?: string
  readonly erreur?: string
  /** Le dossier, sérialisé, que le navigateur transformera en fichier. */
  readonly dossier?: string
  readonly nomFichier?: string
}

const Entree = z.object({ apprenantId: z.string().uuid() })

/**
 * Remet le dossier d'un élève (RGPD art. 20).
 *
 * Le fichier est engendré **dans le navigateur** à partir de cette chaîne,
 * comme les codes d'accès à la mise en route : un dossier RGPD complet qui
 * repasserait par un service de fichiers laisserait une copie de données
 * personnelles là où personne ne pense à aller la chercher.
 */
export async function exporterEleve(
  _precedent: EtatRgpd,
  donnees: FormData,
): Promise<EtatRgpd> {
  // 1. Authentifier
  const session = await sessionCourante()
  if (session.sujetId === null) return { erreur: 'Session expirée.' }

  // 2. Valider
  const entree = Entree.safeParse({ apprenantId: donnees.get('apprenantId') })
  if (!entree.success) return { erreur: 'Élève inconnu.' }

  // 3. Autoriser — l'administrateur d'établissement, pas l'enseignant : le
  //    document 09 §5 désigne nommément qui déclenche un export.
  const decision = peut(session, 'apprenant.lire_nominatif', {})
  if (!decision.autorise) return { erreur: decision.motif }
  if (!session.etablissementId) return { erreur: 'Compte sans établissement.' }

  // 4. Exécuter
  const resultat = await exporterDossier(
    identifiant<IdentifiantApprenant>(entree.data.apprenantId),
    identifiant<IdentifiantEtablissement>(session.etablissementId),
    depotOrganisationPrisma(prisma),
  )
  if (!resultat.ok) return { erreur: resultat.erreur.message }

  // 5. Invalider — rien ne change en base : un export ne modifie pas l'état.

  // 6. Auditer — l'export est l'action la plus sensible de cet écran, et le
  //    document 09 §2 la liste explicitement parmi celles à tracer.
  await auditer('export.produit', session, {
    type: 'apprenant',
    id: entree.data.apprenantId,
  })

  return {
    message: 'Dossier prêt. Le téléchargement ne repasse pas par le serveur.',
    dossier: JSON.stringify(resultat.valeur, null, 2),
    nomFichier: `dossier-rgpd-${entree.data.apprenantId.slice(0, 8)}.json`,
  }
}

/**
 * Efface un élève (RGPD art. 17) — par anonymisation.
 *
 * Irréversible et sans écran de confirmation ici : la confirmation est portée
 * par le formulaire, qui exige de retaper l'identifiant de connexion. Un
 * bouton seul, dans une liste, se clique par erreur.
 */
export async function effacerEleve(
  _precedent: EtatRgpd,
  donnees: FormData,
): Promise<EtatRgpd> {
  // 1. Authentifier
  const session = await sessionCourante()
  if (session.sujetId === null) return { erreur: 'Session expirée.' }

  // 2. Valider
  const entree = Entree.safeParse({ apprenantId: donnees.get('apprenantId') })
  if (!entree.success) return { erreur: 'Élève inconnu.' }

  const confirmation = String(donnees.get('confirmation') ?? '').trim()
  const attendu = String(donnees.get('identifiantAttendu') ?? '').trim()
  if (confirmation === '' || confirmation !== attendu) {
    return { erreur: `Pour confirmer, retape l’identifiant exact : ${attendu}` }
  }

  // 3. Autoriser
  const decision = peut(session, 'apprenant.creer', {})
  if (!decision.autorise) return { erreur: decision.motif }
  if (!session.etablissementId) return { erreur: 'Compte sans établissement.' }

  // 4. Exécuter
  const resultat = await effacerApprenant(
    identifiant<IdentifiantApprenant>(entree.data.apprenantId),
    identifiant<IdentifiantEtablissement>(session.etablissementId),
    depotOrganisationPrisma(prisma),
  )
  if (!resultat.ok) return { erreur: resultat.erreur.message }

  // 5. Invalider — l'élève disparaît des listes, des grilles et des classes.
  revalidatePath('/administration')
  revalidatePath('/administration/rgpd')

  // 6. Auditer
  await auditer('apprenant.efface', session, {
    type: 'apprenant',
    id: entree.data.apprenantId,
  })

  return { message: `Élève anonymisé. Conservé : ${resultat.valeur.conserve}` }
}
