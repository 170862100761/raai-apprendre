/**
 * Les cas d'usage renvoient un résultat, ils ne lèvent pas.
 *
 * Une erreur métier — code faux, quota dépassé, compétence déjà validée — est
 * un cas nominal du domaine : elle se traite, elle s'affiche, elle se teste.
 * Une exception, elle, signale un bug : base injoignable, invariant rompu.
 * Confondre les deux fait qu'on rattrape les bugs par mégarde et qu'on affiche
 * des traces techniques aux élèves.
 */

export type Resultat<T, E = ErreurMetier> =
  | { readonly ok: true; readonly valeur: T }
  | { readonly ok: false; readonly erreur: E }

export type ErreurMetier = {
  readonly code: CodeErreur
  readonly message: string
  /** Erreurs de saisie, par nom de champ. Alimente l'affichage du formulaire. */
  readonly champs?: Readonly<Record<string, string>>
}

/**
 * Liste fermée : un code d'erreur est une promesse faite à l'interface, qui
 * l'utilise pour choisir un message et un comportement. En laisser passer un
 * inconnu revient à afficher « une erreur est survenue ».
 */
export type CodeErreur =
  | 'donnees_invalides'
  | 'non_authentifie'
  | 'non_autorise'
  | 'introuvable'
  | 'conflit'
  | 'regle_metier'
  | 'quota_depasse'
  | 'trop_de_tentatives'
  | 'compte_verrouille'
  | 'erreur_interne'

export const succes = <T>(valeur: T): Resultat<T, never> => ({ ok: true, valeur })

export const echec = (
  code: CodeErreur,
  message: string,
  champs?: Record<string, string>,
): Resultat<never, ErreurMetier> => ({
  ok: false,
  erreur: champs ? { code, message, champs } : { code, message },
})

/** Enchaîne sans dérouler manuellement chaque résultat intermédiaire. */
export function alors<T, U, E>(
  resultat: Resultat<T, E>,
  suite: (valeur: T) => Resultat<U, E>,
): Resultat<U, E> {
  return resultat.ok ? suite(resultat.valeur) : resultat
}

/**
 * Réservé aux tests et aux amorçages, jamais à une Server Action : en
 * production, une erreur métier doit revenir à l'interface, pas exploser.
 */
export function exigerValeur<T, E extends ErreurMetier>(resultat: Resultat<T, E>): T {
  if (!resultat.ok) {
    throw new Error(`Résultat en échec (${resultat.erreur.code}) : ${resultat.erreur.message}`)
  }
  return resultat.valeur
}
