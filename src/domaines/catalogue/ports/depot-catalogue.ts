import type {
  IdentifiantApprenant,
  IdentifiantClasse,
  IdentifiantCompetence,
  IdentifiantLecon,
} from '@/noyau/identifiants'
import type { ContenuBloc } from '../domaine/bloc'
import type { Lecon, LeconDuParcours } from '../domaine/lecon'

export type LeconPubliee = Lecon & {
  readonly chapitre: string
  readonly matiere: string
  /** Évaluation publiée du même chapitre, s'il y en a une. */
  readonly evaluation: { readonly id: string; readonly titre: string } | null
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

  // --- Édition -------------------------------------------------------------

  creerLecon(entree: {
    chapitreId: string
    etablissementId: string
    titre: string
    competences: readonly IdentifiantCompetence[]
  }): Promise<IdentifiantLecon>

  /** Remplace la totalité des blocs. L'éditeur envoie toujours l'état complet. */
  remplacerBlocs(
    leconId: IdentifiantLecon,
    blocs: readonly { contenu: ContenuBloc; genereParIa: boolean }[],
  ): Promise<void>

  remplacerCompetences(
    leconId: IdentifiantLecon,
    competences: readonly IdentifiantCompetence[],
  ): Promise<void>

  modifierTitre(leconId: IdentifiantLecon, titre: string): Promise<void>

  /** Repasse une leçon publiée en brouillon, sur une version neuve. */
  depublier(leconId: IdentifiantLecon, version: number): Promise<void>

  leconsDeLEtablissement(etablissementId: string): Promise<readonly LeconEditable[]>

  chapitresDisponibles(etablissementId: string): Promise<readonly Chapitre[]>

  competencesDuDiplome(etablissementId: string): Promise<readonly CompetenceOption[]>
}

export type LeconEditable = {
  readonly id: IdentifiantLecon
  readonly titre: string
  readonly statut: string
  readonly chapitre: string
  readonly nombreBlocs: number
  readonly nombreCompetences: number
}

export type Chapitre = {
  readonly id: string
  readonly titre: string
  readonly matiere: string
}

export type CompetenceOption = {
  readonly id: IdentifiantCompetence
  readonly code: string
  readonly intitule: string
}
