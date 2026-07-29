/**
 * Où renvoyer quelqu'un après une connexion réussie.
 *
 * `suite` vient de la barre d'adresse, donc de l'extérieur : sans garde, un lien
 * `?suite=//exemple.fr` transformerait notre écran de connexion en tremplin de
 * hameçonnage — l'utilisateur saisit ses accès sur notre domaine et repart
 * ailleurs. On n'accepte donc qu'un chemin interne : commence par `/`, et jamais
 * par `//` (qui désigne un autre hôte).
 *
 * Cette fonction est partagée par les deux écrans de connexion à dessein. Elle
 * existait en un seul exemplaire côté élève ; la recopier côté adulte, c'est
 * accepter qu'une des deux copies dérive le jour où l'on durcit la règle.
 */
export function destination(suite: string | undefined, defaut: string): string {
  if (!suite || !suite.startsWith('/') || suite.startsWith('//')) return defaut
  return suite
}

/**
 * Quel écran de connexion présenter pour un chemin donné.
 *
 * Les espaces `/formateur` et `/administration` n'accueillent que des adultes.
 * Les y renvoyer vers l'écran élève leur présentait un champ « Ton code à 4
 * chiffres » et un tutoiement — constaté en naviguant, sur la grille de suivi.
 */
export function ecranDeConnexion(chemin: string): '/connexion' | '/connexion-formateur' {
  return chemin.startsWith('/formateur') || chemin.startsWith('/administration')
    ? '/connexion-formateur'
    : '/connexion'
}
