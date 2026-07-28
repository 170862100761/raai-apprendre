import type { EvenementAudit } from '../domaine/evenement'
import type { LigneJournal } from '../domaine/lecture'

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

/**
 * Lecture du journal — port distinct de l'écriture, volontairement.
 *
 * Écrire et lire n'ont ni les mêmes appelants, ni les mêmes droits, ni les
 * mêmes conséquences en cas de panne : une écriture qui échoue est tolérée,
 * une lecture qui échoue doit se voir. Les réunir dans une seule interface
 * obligerait chaque écrivain à dépendre d'une capacité de lecture qu'il n'a
 * pas le droit d'exercer.
 */
export interface LectureJournal {
  lire(etablissementId: string, limite: number): Promise<readonly LigneJournal[]>
}
