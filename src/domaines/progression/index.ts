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

export type { DepotProgression, EcritureAcquis } from './ports/depot-progression'

export { depotProgressionPrisma } from './infrastructure/depot-progression-prisma'
