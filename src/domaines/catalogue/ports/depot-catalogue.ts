import type {
  IdentifiantApprenant,
  IdentifiantClasse,
  IdentifiantLecon,
} from '@/noyau/identifiants'
import type { Lecon, LeconDuParcours } from '../domaine/lecon'

export type LeconPubliee = Lecon & {
  readonly chapitre: string
  readonly matiere: string
}

export interface DepotCatalogue {
  /** `null` si la leçon n'existe pas OU est hors périmètre : on ne distingue pas. */
  chargerLecon(id: IdentifiantLecon): Promise<LeconPubliee | null>

  /** Les leçons publiées du programme d'une classe, dans l'ordre. */
  leconsDeLaClasse(classeId: IdentifiantClasse): Promise<readonly LeconDuParcours[]>

  /** Le parcours d'un apprenant, avec son avancement. */
  parcoursDeLApprenant(
    apprenantId: IdentifiantApprenant,
  ): Promise<readonly LeconDuParcours[]>

  publier(
    id: IdentifiantLecon,
    dureeEstimeeMin: number,
    version: number,
  ): Promise<void>
}
