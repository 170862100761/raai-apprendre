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
  creerClasse,
  inscrireEleves,
  type Dependances,
  type EntreeClasse,
  type ResultatInscription,
} from './application/mettre-en-route'

export type {
  AccesEleve,
  AnneeDisponible,
  ClasseCreee,
  DepotOrganisation,
  Etablissement,
  OffreDisponible,
} from './ports/depot-organisation'

export { depotOrganisationPrisma } from './infrastructure/depot-organisation-prisma'
