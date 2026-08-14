/** Surface publique du module `progression`. */

export {
  declarer,
  evaluerAcquisition,
  repartir,
  JOURS_ENTRE_DEUX_CONSTATS,
  SEUIL_ACQUISE,
  type AcquisExistant,
  type Constat,
  type Evolution,
  type NiveauAcquisition,
  type OrigineAcquis,
} from './domaine/acquisition'

export {
  enregistrerResultat,
  type ResultatAEnregistrer,
} from './application/enregistrer-resultat'

export { suivreClasse, type SuiviClasse } from './application/suivre-classe'

export {
  BOM,
  echapperCellule,
  grilleEnCsv,
  nomFichierSur,
  LIBELLES_NIVEAU,
} from './domaine/export-csv'

export { grilleEnXlsx, MIME_XLSX } from './domaine/export-xlsx'

export {
  ABREVIATIONS_NIVEAU,
  grilleEnPdf,
  MIME_PDF,
} from './domaine/export-pdf'

export {
  avancement,
  cle,
  competencesEnDifficulte,
  couvertureReferentiel,
  indexer,
  jamaisConnectes,
  niveauDe,
  sansConnexionRecente,
  JOURS_AVANT_SIGNALEMENT,
  type Cellule,
  type ColonneCompetence,
  type Grille,
  type LigneApprenant,
} from './domaine/suivi'

export type { DepotProgression, EcritureAcquis } from './ports/depot-progression'

export { depotProgressionPrisma } from './infrastructure/depot-progression-prisma'
