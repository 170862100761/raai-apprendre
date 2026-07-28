/** Surface publique du module `audit`. */

export {
  contientDonneePersonnelle,
  dureeConservation,
  estObligatoire,
  tronquerIp,
  RETENTION_JOURS,
  type ActionAuditee,
  type EvenementAudit,
  type TypeSujet,
} from './domaine/evenement'

export { tracer, verifierCharge, type Cible, type Contexte } from './application/tracer'

export type { JournalAudit } from './ports/journal'

export { journalMuet, journalPrisma } from './infrastructure/journal-prisma'
