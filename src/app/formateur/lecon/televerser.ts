'use server'

import { z } from 'zod'
import { after } from 'next/server'
import { prisma } from '@/noyau/prisma'
import { randomUUID } from 'node:crypto'
import {
  depotMediathequePrisma,
  preparerApercu3d,
  stockageDisque,
  televerser,
  tessellateurOcct,
} from '@/domaines/mediatheque'
import { peut } from '@/domaines/identite'
import { sessionCourante } from '../../_session'
import { auditer } from '../../_audit'

export type EtatTeleversement = {
  readonly ressourceId?: string
  readonly nom?: string
  readonly typeMime?: string
  /** Un aperçu 3D se prépare en arrière-plan : l'écran doit le dire. */
  readonly apercuAProduire?: boolean
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
  // 6. Auditer — déposer un fichier dans un établissement laisse une trace :
  //    c'est ce qui permet de remonter à l'auteur d'un contenu litigieux.
  await auditer('ressource.deposee', session, {
    type: 'ressource',
    id: resultat.valeur.ressourceId,
  })

  // Un STEP n'est pas affichable tel quel : sa tessellation est un travail
  // serveur (doc 02 §5), et elle prend de l'ordre de la seconde pour une pièce,
  // bien davantage pour un assemblage.
  //
  // `after` et non une promesse abandonnée : l'enseignant récupère sa ressource
  // sans attendre la conversion, mais l'hébergeur sait qu'un travail reste en
  // cours et ne coupe pas l'exécution au moment où la réponse partirait. Une
  // promesse lâchée dans le vide serait tuée avec l'invocation, et le statut
  // resterait « en cours » pour toujours.
  //
  // Le jour où une file de travaux existe, c'est ce bloc qui devient une mise en
  // file — le cas d'usage, lui, ne bouge pas.
  if (resultat.valeur.apercuAProduire) {
    const ressourceId = resultat.valeur.ressourceId
    after(async () => {
      // Même logique que le journal d'audit : un dépôt de fichier ne doit pas
      // échouer parce qu'une conversion a échoué. Le fichier est écrit, la
      // ressource créée, et c'est le statut qui portera le verdict.
      try {
        const apercu = await preparerApercu3d(ressourceId, {
          depot: depotMediathequePrisma(prisma),
          stockage: stockageDisque,
          tessellateur: tessellateurOcct,
        })
        if (!apercu.ok) {
          console.error('[apercu-3d]', ressourceId, apercu.erreur.message)
        }
      } catch (erreur) {
        console.error('[apercu-3d] panne', ressourceId, erreur)
      }
    })
  }

  return {
    ressourceId: resultat.valeur.ressourceId,
    nom: resultat.valeur.nom,
    typeMime: resultat.valeur.typeMime,
    apercuAProduire: resultat.valeur.apercuAProduire,
  }
}
