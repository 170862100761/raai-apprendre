import type {
  IdentifiantApprenant,
  IdentifiantClasse,
  IdentifiantEtablissement,
} from '@/noyau/identifiants'
import type { ApprenantAnonymise, DossierRgpd } from '../domaine/dossier-rgpd'

export type Etablissement = {
  readonly id: IdentifiantEtablissement
  readonly nom: string
  readonly uai: string
}

export type OffreDisponible = {
  readonly id: string
  readonly intituleDiplome: string
  readonly niveaux: readonly { id: string; code: string; intitule: string }[]
}

export type AnneeDisponible = {
  readonly id: string
  readonly libelle: string
}

export type ClasseCreee = {
  readonly id: IdentifiantClasse
  readonly nom: string
  readonly codeRattachement: string
}

/** Ce qu'on remet au formateur, UNE seule fois : le code n'est plus lisible ensuite. */
export type AccesEleve = {
  readonly apprenantId: IdentifiantApprenant
  readonly prenom: string
  readonly initialeNom: string
  readonly identifiant: string
  readonly code: string
}

export interface DepotOrganisation {
  chargerEtablissement(id: IdentifiantEtablissement): Promise<Etablissement | null>

  offresDisponibles(id: IdentifiantEtablissement): Promise<readonly OffreDisponible[]>
  anneesDisponibles(id: IdentifiantEtablissement): Promise<readonly AnneeDisponible[]>

  creerClasse(entree: {
    etablissementId: IdentifiantEtablissement
    offreId: string
    niveauId: string
    anneeId: string
    nom: string
    codeRattachement: string
  }): Promise<ClasseCreee>

  /** Identifiants déjà attribués dans l'établissement, pour éviter les collisions. */
  identifiantsPris(etablissementId: IdentifiantEtablissement): Promise<ReadonlySet<string>>

  inscrireEleves(
    classeId: IdentifiantClasse,
    etablissementId: IdentifiantEtablissement,
    eleves: readonly {
      prenom: string
      initialeNom: string
      identifiant: string
      codeHash: string
    }[],
  ): Promise<readonly { id: IdentifiantApprenant; identifiant: string }[]>

  classeExiste(
    classeId: IdentifiantClasse,
    etablissementId: IdentifiantEtablissement,
  ): Promise<boolean>

  // --- RGPD ---------------------------------------------------------------

  /** `null` si l'élève n'existe pas ou sort du périmètre de l'établissement. */
  assemblerDossier(
    apprenantId: IdentifiantApprenant,
    etablissementId: IdentifiantEtablissement,
  ): Promise<DossierRgpd | null>

  /**
   * Les prénoms des AUTRES élèves des mêmes classes.
   *
   * Sert uniquement à vérifier qu'ils ne sont pas dans le dossier qu'on
   * s'apprête à remettre. Lire pour contrôler, jamais pour exporter.
   */
  prenomsDesCamarades(
    apprenantId: IdentifiantApprenant,
    etablissementId: IdentifiantEtablissement,
  ): Promise<readonly string[]>

  anonymiserApprenant(
    apprenantId: IdentifiantApprenant,
    etablissementId: IdentifiantEtablissement,
    valeurs: ApprenantAnonymise,
  ): Promise<void>

  /** Relecture après écriture, pour confirmer que l'effacement a bien pris. */
  relireApprenant(apprenantId: IdentifiantApprenant): Promise<{
    prenom: string
    initialeNom: string
    identifiant: string | null
    codeHash: string | null
    compteId: string | null
    vuLe: Date | null
  } | null>
}
