/**
 * Surface publique du module `catalogue`.
 *
 * Le module ne dépend d'aucun autre : le rattachement au référentiel passe par
 * des identifiants de compétence, pas par un import du module `referentiel`.
 * C'est ce qui permet de faire évoluer les deux séparément.
 */

export {
  alertesAccessibilite,
  dureeEstimeeMinutes,
  lireContenu,
  SchemaBloc,
  type Bloc,
  type ContenuBloc,
  type TypeBloc,
} from './domaine/bloc'

export {
  peutPasserA,
  prochaineAction,
  validerPourPublication,
  versionSuivante,
  type Lecon,
  type LeconDuParcours,
  type StatutLecon,
} from './domaine/lecon'

export {
  publierLecon,
  type PublicationReussie,
} from './application/publier-lecon'

export { chargerParcours, type Parcours } from './application/parcours-apprenant'

export type { DepotCatalogue, LeconPubliee } from './ports/depot-catalogue'

export {
  depotCataloguePrisma,
  enregistrerLecture,
} from './infrastructure/depot-catalogue-prisma'
