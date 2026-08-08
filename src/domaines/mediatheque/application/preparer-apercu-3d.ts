import { echec, succes, type Resultat } from '@/noyau/resultat'
import {
  aBesoinDApercu3d,
  cheminApercu,
  DEFLEXIONS,
  MIME_APERCU_3D,
  nombreDeTriangles,
  tientDansLeBudget,
} from '../domaine/apercu-3d'
import { ecrireGlb, type MaillageTessele } from '../domaine/glb'
import type { DepotMediatheque, StockageObjet } from '../ports/stockage'
import type { TessellateurStep } from '../ports/tessellation'

/**
 * Production de l'aperçu 3D d'un fichier STEP.
 *
 * Séparé du téléversement, et c'est le point important. Tesseller une pièce
 * prend de l'ordre de la seconde, un assemblage bien davantage : le faire dans
 * la requête qui reçoit le fichier ferait dépendre le dépôt d'un travail de CAO,
 * et sur Vercel la requête expirerait avant la fin. Ce cas d'usage est donc
 * appelable seul, autant de fois qu'on veut, et par un travail de fond le jour
 * où il y en aura un.
 *
 * Idempotent : un aperçu déjà produit n'est pas recalculé. C'est ce qui rend une
 * reprise après incident sans danger.
 */

export type ApercuPrepare = {
  readonly cheminApercu: string
  readonly triangles: number
  readonly deflexion: number
  readonly octets: number
}

export async function preparerApercu3d(
  ressourceId: string,
  {
    depot,
    stockage,
    tessellateur,
  }: {
    depot: DepotMediatheque
    stockage: StockageObjet
    tessellateur: TessellateurStep
  },
): Promise<Resultat<ApercuPrepare>> {
  const ressource = await depot.charger(ressourceId)
  if (!ressource) return echec('introuvable', 'Média introuvable.')

  if (!aBesoinDApercu3d(ressource.typeMime)) {
    return echec('donnees_invalides', 'Ce format n’a pas d’aperçu 3D à produire.')
  }

  if (ressource.cheminApercu) {
    return echec('conflit', 'L’aperçu existe déjà.')
  }

  const source = await stockage.lire(ressource.cheminStockage)
  if (!source) {
    // Le fichier a disparu du stockage alors que la ligne existe. Le statut doit
    // le dire : sans cela, un travail de fond réessaierait indéfiniment.
    await depot.marquerTraitement(ressourceId, 'echoue')
    return echec('introuvable', 'Fichier source introuvable.')
  }

  await depot.marquerTraitement(ressourceId, 'en_cours')

  const tessellation = await tesselerDansLeBudget(source, tessellateur)
  if (!tessellation) {
    await depot.marquerTraitement(ressourceId, 'echoue')
    return echec(
      'donnees_invalides',
      'Ce fichier STEP n’a pas pu être converti pour l’affichage. ' +
        'Il reste téléchargeable et ouvrable dans un logiciel de CAO.',
    )
  }

  const glb = ecrireGlb(tessellation.maillages)
  if (!glb.ok) {
    await depot.marquerTraitement(ressourceId, 'echoue')
    return glb
  }

  const chemin = cheminApercu(ressource.cheminStockage)

  // On écrit le fichier avant d'enregistrer le chemin : l'inverse laisserait une
  // ligne qui promet un aperçu absent, et la visionneuse afficherait un bouton
  // qui échoue.
  await stockage.ecrire(chemin, glb.valeur, MIME_APERCU_3D)
  await depot.enregistrerApercu(ressourceId, chemin)

  return succes({
    cheminApercu: chemin,
    triangles: nombreDeTriangles(tessellation.maillages),
    deflexion: tessellation.deflexion,
    octets: glb.valeur.byteLength,
  })
}

export type Apercu3dServi = {
  readonly contenu: Uint8Array
  readonly nom: string
}

/**
 * Service de l'aperçu.
 *
 * Distinct de `servirMedia` parce que ce n'est pas le même fichier : l'URL du
 * média rend toujours l'original — un enseignant qui télécharge un STEP doit
 * recevoir son STEP, pas une approximation triangulée.
 */
export async function servirApercu3d(
  ressourceId: string,
  { depot, stockage }: { depot: DepotMediatheque; stockage: StockageObjet },
): Promise<Resultat<Apercu3dServi>> {
  const ressource = await depot.charger(ressourceId)
  if (!ressource?.cheminApercu) {
    return echec('introuvable', 'Aperçu introuvable.')
  }

  const contenu = await stockage.lire(ressource.cheminApercu)
  if (!contenu) return echec('introuvable', 'Aperçu introuvable.')

  return succes({ contenu, nom: `${ressource.nom}.glb` })
}

/**
 * Tessellation, en allégeant tant que le budget est dépassé.
 *
 * On garde le dernier résultat même s'il dépasse encore après la déflexion la
 * plus grossière : un assemblage lourd mais affichable vaut mieux qu'un écran
 * qui annonce un échec. Le budget est un objectif, pas un interdit.
 */
async function tesselerDansLeBudget(
  source: Uint8Array,
  tessellateur: TessellateurStep,
): Promise<{ maillages: readonly MaillageTessele[]; deflexion: number } | null> {
  let dernier: { maillages: readonly MaillageTessele[]; deflexion: number } | null = null

  for (const deflexion of DEFLEXIONS) {
    const maillages = await tessellateur.tesseller(source, deflexion)
    // `null` au premier essai signe un fichier illisible : les suivants
    // échoueraient pareil, inutile de payer trois tessellations pour l'apprendre.
    if (!maillages) return dernier

    dernier = { maillages, deflexion }
    if (tientDansLeBudget(maillages)) return dernier
  }

  return dernier
}
