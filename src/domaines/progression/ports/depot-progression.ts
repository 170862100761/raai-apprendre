import type { IdentifiantApprenant, IdentifiantCompetence } from '@/noyau/identifiants'
import type { AcquisExistant, NiveauAcquisition, OrigineAcquis } from '../domaine/acquisition'

export type EcritureAcquis = {
  readonly apprenantId: IdentifiantApprenant
  readonly competenceId: IdentifiantCompetence
  readonly etablissementId: string
  readonly niveau: NiveauAcquisition
  readonly score: number
  readonly origine: OrigineAcquis
  readonly sourceId: string | null
  readonly constateLe: Date
}

export interface DepotProgression {
  lireAcquis(
    apprenantId: IdentifiantApprenant,
    competences: readonly IdentifiantCompetence[],
  ): Promise<ReadonlyMap<IdentifiantCompetence, AcquisExistant>>

  /** La version de référentiel est résolue par l'adaptateur, pas par le domaine. */
  ecrireAcquis(ecritures: readonly EcritureAcquis[]): Promise<void>
}
