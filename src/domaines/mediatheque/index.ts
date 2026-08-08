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

export {
  aBesoinDApercu3d,
  BUDGET_TRIANGLES,
  cheminApercu,
  DEFLEXIONS,
  MIME_APERCU_3D,
  nombreDeTriangles,
  tientDansLeBudget,
} from './domaine/apercu-3d'

export { ecrireGlb, type MaillageTessele } from './domaine/glb'

export {
  preparerApercu3d,
  servirApercu3d,
  type Apercu3dServi,
  type ApercuPrepare,
} from './application/preparer-apercu-3d'

export type {
  DepotMediatheque,
  RessourceStockee,
  StatutTraitement,
  StockageObjet,
} from './ports/stockage'
export type { TessellateurStep } from './ports/tessellation'

export { depotMediathequePrisma } from './infrastructure/depot-mediatheque-prisma'
export { stockageDisque } from './infrastructure/stockage-disque'
export { tessellateurOcct } from './infrastructure/tessellateur-occt'
