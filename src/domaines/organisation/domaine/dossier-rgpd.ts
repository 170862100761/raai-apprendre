/**
 * Le dossier RGPD d'un élève : ce qu'on rend, et ce qu'on efface.
 *
 * Deux droits, deux opérations qui ne se ressemblent pas :
 *
 * - **Portabilité** (art. 20) : rendre à l'élève ce qui le concerne, dans un
 *   format ouvert et relisible. Le piège est d'en rendre trop — l'export d'un
 *   élève ne doit contenir aucune trace d'un autre, et une jointure distraite
 *   sur la classe suffirait à embarquer vingt-neuf camarades.
 *
 * - **Effacement** (art. 17) : le document 09 §5 tranche « anonymisation, pas
 *   suppression : les statistiques agrégées survivent ». Supprimer les lignes
 *   ferait mentir la couverture du référentiel d'une classe entière, des mois
 *   après coup, sans que personne ne comprenne pourquoi. On efface donc ce qui
 *   identifie, et on garde ce qui compte.
 *
 * Tout est pur : ce fichier décrit les règles, il n'ouvre aucune base.
 */

/**
 * Les colonnes qui, seules ou combinées, désignent une personne.
 *
 * Liste **fermée et exhaustive** : c'est elle que le test d'anonymisation
 * parcourt. Ajouter une colonne personnelle au schéma sans l'inscrire ici fait
 * échouer ce test — c'est le seul garde-fou qui survit à un ajout distrait,
 * et il vaut mieux qu'une revue de code.
 */
export const CHAMPS_IDENTIFIANTS = [
  'prenom',
  'initialeNom',
  'identifiant',
  'codeHash',
  'compteId',
  'vuLe',
] as const

export type ChampIdentifiant = (typeof CHAMPS_IDENTIFIANTS)[number]

/** L'élève tel qu'il est en base, réduit à ce qui nous intéresse ici. */
export type ApprenantIdentifiable = {
  readonly id: string
  readonly prenom: string
  readonly initialeNom: string
  readonly identifiant: string | null
  readonly codeHash: string | null
  readonly compteId: string | null
  readonly vuLe: Date | null
  readonly actif: boolean
}

/**
 * Ce que devient un élève anonymisé.
 *
 * `prenom` ne devient pas une chaîne vide : un écran qui affiche « » laisse
 * croire à un bogue. « Élève retiré » se lit, se comprend, et ne désigne
 * personne. L'identifiant de connexion et le code sont mis à `null` — pas
 * remplacés par une valeur factice, qui resterait un secret à gérer.
 */
export const MENTION_ANONYME = 'Élève retiré'

export type ApprenantAnonymise = {
  readonly prenom: string
  readonly initialeNom: string
  readonly identifiant: null
  readonly codeHash: null
  readonly compteId: null
  readonly vuLe: null
  readonly actif: false
}

export function anonymiser(): ApprenantAnonymise {
  return {
    prenom: MENTION_ANONYME,
    initialeNom: '',
    identifiant: null,
    codeHash: null,
    compteId: null,
    vuLe: null,
    actif: false,
  }
}

/**
 * Reste-t-il de quoi reconnaître quelqu'un ?
 *
 * Sert au test, mais aussi à l'exécution : on vérifie APRÈS écriture que
 * l'anonymisation a bien pris. Une anonymisation à moitié appliquée est pire
 * que pas d'anonymisation du tout — on croit le dossier clos.
 */
export function resteIdentifiable(apprenant: {
  readonly prenom: string
  readonly initialeNom: string
  readonly identifiant: string | null
  readonly codeHash: string | null
  readonly compteId: string | null
  readonly vuLe: Date | null
}): boolean {
  return (
    apprenant.prenom !== MENTION_ANONYME ||
    apprenant.initialeNom !== '' ||
    apprenant.identifiant !== null ||
    apprenant.codeHash !== null ||
    apprenant.compteId !== null ||
    apprenant.vuLe !== null
  )
}

// --- Portabilité -----------------------------------------------------------

export type LigneAcquis = {
  readonly competence: string
  readonly intitule: string
  readonly niveau: string
  readonly constateLe: string
}

export type LigneTentative = {
  readonly evaluation: string
  readonly statut: string
  readonly score: number | null
  readonly scoreMax: number | null
  readonly soumiseLe: string | null
}

export type LigneLecture = {
  readonly lecon: string
  readonly termineeLe: string | null
}

/**
 * Le dossier remis à l'élève ou à son représentant.
 *
 * Daté et versionné : un export sans date ne prouve rien six mois plus tard,
 * et l'établissement doit pouvoir dire ce qu'il a remis, quand.
 */
export type DossierRgpd = {
  readonly version: 1
  readonly genereLe: string
  readonly etablissement: string
  readonly eleve: {
    readonly prenom: string
    readonly initialeNom: string
    readonly identifiant: string | null
    readonly inscritLe: string
  }
  readonly classes: readonly string[]
  readonly acquis: readonly LigneAcquis[]
  readonly evaluations: readonly LigneTentative[]
  readonly lectures: readonly LigneLecture[]
}

/**
 * Le dossier contient-il quelque chose qui ne concerne pas cet élève ?
 *
 * On cherche les prénoms des camarades, jamais un identifiant technique : un
 * UUID de classe n'est pas une donnée personnelle, le prénom d'un autre élève
 * l'est. C'est le contrôle qui manque le plus souvent aux exports RGPD.
 */
export function contientUnTiers(
  dossier: DossierRgpd,
  prenomsDesAutres: readonly string[],
): boolean {
  if (prenomsDesAutres.length === 0) return false
  const serialise = JSON.stringify(dossier).toLowerCase()

  return prenomsDesAutres.some((prenom) => {
    const cherche = prenom.trim().toLowerCase()
    // Un prénom trop court — « Al » — produirait des correspondances fortuites
    // dans n'importe quel mot. On ne teste que ce qui est discriminant.
    if (cherche.length < 3) return false
    return serialise.includes(cherche)
  })
}
