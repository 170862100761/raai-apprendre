/** Surface publique du module `mediatheque`. */

export {
  nomSur,
  signatureValide,
  typePourExtension,
  TYPES_ACCEPTES,
  type CategorieFichier,
  type TypeAccepte,
} from './domaine/type-fichier'

export {
  OCTETS_DE_TETE,
  validerTeleversement,
  type DemandeTeleversement,
  type FichierAccepte,
} from './domaine/televersement'

export {
  servirMedia,
  televerser,
  type MediaServi,
  type RessourceCreee,
  type Televersement,
} from './application/televerser'

export type { DepotMediatheque, RessourceStockee, StockageObjet } from './ports/stockage'

export { depotMediathequePrisma } from './infrastructure/depot-mediatheque-prisma'
export { stockageDisque } from './infrastructure/stockage-disque'
