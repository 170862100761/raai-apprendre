import type { EvenementAudit } from '../domaine/evenement'

/**
 * Écrire dans le journal ne doit JAMAIS faire échouer l'action auditée.
 *
 * Refuser une connexion parce que le journal est indisponible transformerait
 * une panne d'observabilité en panne de service. On journalise au mieux, et on
 * signale l'échec ailleurs — c'est le compromis explicite de ce port.
 */
export interface JournalAudit {
  journaliser(evenement: EvenementAudit): Promise<void>
}
