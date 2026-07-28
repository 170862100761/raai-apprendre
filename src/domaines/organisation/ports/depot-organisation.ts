import type {
  IdentifiantApprenant,
  IdentifiantClasse,
  IdentifiantEtablissement,
} from '@/noyau/identifiants'

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
}
