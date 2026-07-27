import type { IdentifiantApprenant } from '@/noyau/identifiants'
import { prochaineAction, type LeconDuParcours } from '../domaine/lecon'
import type { DepotCatalogue } from '../ports/depot-catalogue'

export type Parcours = {
  /** Ce qu'on met en grand, en haut du tableau de bord. */
  readonly prochaine: LeconDuParcours | null
  readonly lecons: readonly LeconDuParcours[]
  readonly terminees: number
}

/**
 * Le parcours d'un élève : ce qu'il a à faire, et par quoi commencer.
 *
 * Une seule action est mise en avant. Le tableau de bord répond à « qu'est-ce
 * que je fais maintenant ? », pas à « voici quatorze indicateurs ».
 */
export async function chargerParcours(
  apprenantId: IdentifiantApprenant,
  depot: DepotCatalogue,
): Promise<Parcours> {
  const lecons = await depot.parcoursDeLApprenant(apprenantId)

  return {
    prochaine: prochaineAction(lecons),
    lecons,
    terminees: lecons.filter((l) => l.terminee).length,
  }
}
