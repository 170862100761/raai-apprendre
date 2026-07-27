/**
 * Identifiants marqués.
 *
 * Un `string` passé au mauvais paramètre est un incident de production :
 * `chargerApprenant(classeId)` compile parfaitement et renvoie « introuvable »
 * en silence. Un type marqué en fait une erreur de compilation.
 *
 * Le marquage disparaît à l'exécution : aucun coût, aucune allocation.
 */

declare const marque: unique symbol

type Marque<T, Nom extends string> = T & { readonly [marque]: Nom }

export type IdentifiantCompte = Marque<string, 'Compte'>
export type IdentifiantApprenant = Marque<string, 'Apprenant'>
export type IdentifiantEtablissement = Marque<string, 'Etablissement'>
export type IdentifiantAcademie = Marque<string, 'Academie'>
export type IdentifiantClasse = Marque<string, 'Classe'>
export type IdentifiantLecon = Marque<string, 'Lecon'>
export type IdentifiantEvaluation = Marque<string, 'Evaluation'>
export type IdentifiantTentative = Marque<string, 'Tentative'>
export type IdentifiantCompetence = Marque<string, 'Competence'>
export type IdentifiantVersionReferentiel = Marque<string, 'VersionReferentiel'>
export type JetonSession = Marque<string, 'JetonSession'>

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const estUuid = (valeur: string): boolean => UUID.test(valeur)

/**
 * Marque une valeur venue de la base ou d'une entrée déjà validée.
 * Ne pas l'appeler sur une saisie brute : la validation vient d'abord.
 */
export function identifiant<T extends string>(valeur: string): T {
  return valeur as T
}
