/** Surface publique du module `organisation`. */

export {
  analyserImport,
  codeDeRattachement,
  identifiantDeConnexion,
  type AnalyseImport,
  type EleveAInscrire,
  type LigneRejetee,
} from './domaine/inscription'

export {
  anonymiser,
  contientUnTiers,
  resteIdentifiable,
  CHAMPS_IDENTIFIANTS,
  MENTION_ANONYME,
  type DossierRgpd,
} from './domaine/dossier-rgpd'

export {
  creerClasse,
  inscrireEleves,
  type Dependances,
  type EntreeClasse,
  type ResultatInscription,
} from './application/mettre-en-route'

export {
  effacerApprenant,
  exporterDossier,
  type EffacementFait,
} from './application/dossier-rgpd'

export type {
  AccesEleve,
  AnneeDisponible,
  ClasseCreee,
  DepotOrganisation,
  Etablissement,
  OffreDisponible,
} from './ports/depot-organisation'

export { depotOrganisationPrisma } from './infrastructure/depot-organisation-prisma'
