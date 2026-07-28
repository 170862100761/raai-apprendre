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

export {
  aSignaler,
  libelle,
  libelleRole,
  parJournee,
  type JourneeJournal,
  type LigneJournal,
} from './domaine/lecture'

export type { JournalAudit, LectureJournal } from './ports/journal'

export {
  journalMuet,
  journalPrisma,
  lectureJournalPrisma,
} from './infrastructure/journal-prisma'
