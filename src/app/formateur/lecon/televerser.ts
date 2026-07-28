'use server'

import { z } from 'zod'
import { prisma } from '@/noyau/prisma'
import { randomUUID } from 'node:crypto'
import {
  depotMediathequePrisma,
  stockageDisque,
  televerser,
} from '@/domaines/mediatheque'
import { peut } from '@/domaines/identite'
import { sessionCourante } from '../../_session'

export type EtatTeleversement = {
  readonly ressourceId?: string
  readonly nom?: string
  readonly typeMime?: string
  readonly erreur?: string
}

const LIMITE_ABSOLUE = 200 * 1024 * 1024

export async function envoyerFichier(
  _precedent: EtatTeleversement,
  donnees: FormData,
): Promise<EtatTeleversement> {
  // 1. Authentifier
  const session = await sessionCourante()
  if (session.sujetId === null) return { erreur: 'Session expirée. Reconnecte-toi.' }

  // 2. Valider
  const fichier = donnees.get('fichier')
  if (!(fichier instanceof File)) return { erreur: 'Aucun fichier reçu.' }

  const nom = z.string().min(1).max(255).safeParse(fichier.name)
  if (!nom.success) return { erreur: 'Nom de fichier invalide.' }

  // Garde-fou avant de charger quoi que ce soit en mémoire : la limite fine
  // par type est appliquée ensuite, dans le domaine.
  if (fichier.size > LIMITE_ABSOLUE) {
    return { erreur: 'Fichier trop lourd.' }
  }

  // 3. Autoriser
  if (!peut(session, 'lecon.ecrire').autorise) {
    return { erreur: 'Tu n’as pas les droits pour ajouter un média.' }
  }
  if (!session.etablissementId) return { erreur: 'Compte sans établissement.' }

  // 4. Exécuter
  const resultat = await televerser(
    {
      etablissementId: session.etablissementId,
      nom: nom.data,
      contenu: new Uint8Array(await fichier.arrayBuffer()),
    },
    {
      depot: depotMediathequePrisma(prisma),
      stockage: stockageDisque,
      identifiant: randomUUID,
    },
  )

  if (!resultat.ok) return { erreur: resultat.erreur.message }

  // 5. Invalider — rien : la ressource n'est référencée qu'au moment où
  //    l'enseignant enregistre la leçon.
  // 6. Auditer — arrivera avec le module `audit`.

  return {
    ressourceId: resultat.valeur.ressourceId,
    nom: resultat.valeur.nom,
    typeMime: resultat.valeur.typeMime,
  }
}
