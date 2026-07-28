import type {
  IdentifiantApprenant,
  IdentifiantClasse,
  IdentifiantCompetence,
} from '@/noyau/identifiants'
import type { AcquisExistant, NiveauAcquisition, OrigineAcquis } from '../domaine/acquisition'
import type { Grille } from '../domaine/suivi'

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

  /** `null` si la classe n'existe pas ou est hors périmètre. */
  lireGrilleClasse(classeId: IdentifiantClasse): Promise<(Grille & {
    readonly nomClasse: string
    readonly etablissementId: string
  }) | null>
}
