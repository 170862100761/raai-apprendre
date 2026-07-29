import type { IdentifiantApprenant } from '@/noyau/identifiants'
import {
  aVenir,
  ECHEANCES_AFFICHEES,
  JOURS_DE_LA_SEMAINE,
  type Echeance,
} from '../domaine/echeance'
import type { DepotEvaluation } from '../ports/depot-evaluation'

export type TableauDEcheances = {
  /** Les trois premières, dans l'ordre où elles pressent. */
  readonly affichees: readonly Echeance[]
  /** Ce qui suit, dans le même ordre : le dépliant « tout voir ». */
  readonly reste: readonly Echeance[]
  /** Longueur de `reste`, pour libeller le dépliant sans le compter deux fois. */
  readonly masquees: number
}

/**
 * Ce que l'élève doit rendre, prêt à afficher.
 *
 * La lecture ne peut pas échouer au sens métier : un élève sans échéance a un
 * tableau vide, ce n'est pas une erreur — d'où l'absence de `Resultat`, comme
 * pour `chargerParcours`.
 *
 * `maintenant` est un paramètre jusqu'ici : la couche de présentation fixe
 * l'instant une fois, et les trois lectures qui suivent répondent toutes de la
 * même date. Une page rendue à minuit moins une minute ne doit pas mélanger
 * deux « aujourd'hui ».
 */
export async function chargerEcheances(
  apprenantId: IdentifiantApprenant,
  depot: DepotEvaluation,
  maintenant: Date = new Date(),
): Promise<TableauDEcheances> {
  const echeances = await depot.echeancesDeLApprenant(apprenantId, horizon(maintenant))
  const pressantes = aVenir(echeances, maintenant)

  const reste = pressantes.slice(ECHEANCES_AFFICHEES)

  return {
    affichees: pressantes.slice(0, ECHEANCES_AFFICHEES),
    reste,
    masquees: reste.length,
  }
}

/**
 * Jusqu'où la base est interrogée.
 *
 * Un jour de plus que la semaine du domaine : la borne sert à ne pas lire
 * l'année entière, pas à trancher. Serrer les deux au même jour ferait
 * dépendre l'affichage d'un `lte` contre un `<=` — le genre d'écart qui fait
 * disparaître une échéance limite sans que personne ne comprenne pourquoi.
 */
function horizon(maintenant: Date): Date {
  const borne = new Date(maintenant)
  borne.setDate(borne.getDate() + JOURS_DE_LA_SEMAINE + 1)
  return borne
}
