'use server'

import { z } from 'zod'
import { after } from 'next/server'
import { prisma } from '@/noyau/prisma'
import { randomUUID } from 'node:crypto'
import {
  depotMediathequePrisma,
  preparerApercu3d,
  televerser,
  tessellateurOcct,
} from '@/domaines/mediatheque'
import { peut } from '@/domaines/identite'
import { sessionCourante } from '../../_session'
import { stockage } from '../../_stockage'
import { auditer } from '../../_audit'

export type EtatTeleversement = {
  readonly ressourceId?: string
  readonly nom?: string
  readonly typeMime?: string
  /** Un aperÃ§u 3D se prÃ©pare en arriÃ¨re-plan : l'Ã©cran doit le dire. */
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
  if (session.sujetId === null) return { erreur: 'Session expirÃ©e. Reconnecte-toi.' }

  // 2. Valider
  const fichier = donnees.get('fichier')
  if (!(fichier instanceof File)) return { erreur: 'Aucun fichier reÃ§u.' }

  const nom = z.string().min(1).max(255).safeParse(fichier.name)
  if (!nom.success) return { erreur: 'Nom de fichier invalide.' }

  // Garde-fou avant de charger quoi que ce soit en mÃ©moire : la limite fine
  // par type est appliquÃ©e ensuite, dans le domaine.
  if (fichier.size > LIMITE_ABSOLUE) {
    return { erreur: 'Fichier trop lourd.' }
  }

  // 3. Autoriser
  if (!peut(session, 'lecon.ecrire').autorise) {
    return { erreur: 'Tu nâ€™as pas les droits pour ajouter un mÃ©dia.' }
  }
  if (!session.etablissementId) return { erreur: 'Compte sans Ã©tablissement.' }

  // 4. ExÃ©cuter
  const resultat = await televerser(
    {
      etablissementId: session.etablissementId,
      nom: nom.data,
      contenu: new Uint8Array(await fichier.arrayBuffer()),
    },
    {
      depot: depotMediathequePrisma(prisma),
      stockage: stockage(),
      identifiant: randomUUID,
    },
  )

  if (!resultat.ok) return { erreur: resultat.erreur.message }

  // 5. Invalider â€” rien : la ressource n'est rÃ©fÃ©rencÃ©e qu'au moment oÃ¹
  //    l'enseignant enregistre la leÃ§on.
  // 6. Auditer â€” dÃ©poser un fichier dans un Ã©tablissement laisse une trace :
  //    c'est ce qui permet de remonter Ã  l'auteur d'un contenu litigieux.
  await auditer('ressource.deposee', session, {
    type: 'ressource',
    id: resultat.valeur.ressourceId,
  })

  // Un STEP n'est pas affichable tel quel : sa tessellation est un travail
  // serveur (doc 02 Â§5), et elle prend de l'ordre de la seconde pour une piÃ¨ce,
  // bien davantage pour un assemblage.
  //
  // `after` et non une promesse abandonnÃ©e : l'enseignant rÃ©cupÃ¨re sa ressource
  // sans attendre la conversion, mais l'hÃ©bergeur sait qu'un travail reste en
  // cours et ne coupe pas l'exÃ©cution au moment oÃ¹ la rÃ©ponse partirait. Une
  // promesse lÃ¢chÃ©e dans le vide serait tuÃ©e avec l'invocation, et le statut
  // resterait Â« en cours Â» pour toujours.
  //
  // Le jour oÃ¹ une file de travaux existe, c'est ce bloc qui devient une mise en
  // file â€” le cas d'usage, lui, ne bouge pas.
  if (resultat.valeur.apercuAProduire) {
    const ressourceId = resultat.valeur.ressourceId
    after(async () => {
      // MÃªme logique que le journal d'audit : un dÃ©pÃ´t de fichier ne doit pas
      // Ã©chouer parce qu'une conversion a Ã©chouÃ©. Le fichier est Ã©crit, la
      // ressource crÃ©Ã©e, et c'est le statut qui portera le verdict.
      try {
        const apercu = await preparerApercu3d(ressourceId, {
          depot: depotMediathequePrisma(prisma),
          stockage: stockage(),
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
