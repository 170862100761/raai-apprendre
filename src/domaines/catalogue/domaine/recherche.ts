/**
 * Recherche dans les leçons.
 *
 * Volontairement **pure** : elle filtre et classe une liste déjà chargée, elle
 * n'interroge pas la base. Deux conséquences qui valent leur prix en
 * performance à l'échelle du MVP :
 *
 * - le cloisonnement est inchangé. Les listes viennent des chemins existants
 *   (`leconsDeLEtablissement`, `parcoursDeLApprenant`), donc de requêtes déjà
 *   soumises à la RLS. Une recherche qui écrirait son propre SQL serait une
 *   deuxième porte à surveiller ;
 * - le comportement se teste sans base, donc il est réellement testé.
 *
 * À l'échelle d'un établissement — quelques centaines de leçons — parcourir la
 * liste coûte moins qu'un aller-retour réseau. **Ce choix ne tient plus au
 * niveau national** : le jour où l'on cherche dans la bibliothèque partagée, il
 * faudra un index Postgres (`tsvector` + `unaccent`) et cette fonction ne
 * servira plus qu'au classement.
 */

/** Ce dont la recherche a besoin. Ni plus, ni identifiant : elle ne renvoie
 *  que ce qu'on lui a donné, et l'appelant garde ses propres objets. */
export type Cherchable = {
  readonly titre: string
  readonly chapitre: string
}

/**
 * Longueur minimale d'un terme retenu.
 *
 * En dessous, tout ressort et le résultat n'apprend rien. Deux caractères et
 * non trois : « TP », « PC » ou « 3D » sont des recherches légitimes en
 * enseignement technique.
 */
export const LONGUEUR_MINIMALE = 2

/**
 * Met un texte sous une forme comparable : minuscules, sans accent, sans
 * ponctuation.
 *
 * Sans cela, « sécurité » ne trouverait pas « securite ». Un élève de seize ans
 * tape rarement les accents, et lui rendre zéro résultat lui apprend surtout
 * que la recherche ne marche pas. `NFD` sépare la lettre de son accent, ce qui
 * permet de retirer le second sans toucher à la première.
 *
 * Les ligatures sont traitées à part : `NFD` ne décompose PAS « œ » en « oe »,
 * parce que ce n'est pas une lettre accentuée mais un caractère à part entière.
 * Le cas n'a rien de théorique — un chapitre s'appelle « Sécurité à la mise en
 * œuvre », que personne ne tapera autrement que « mise en oeuvre ».
 */
const LIGATURES: readonly (readonly [RegExp, string])[] = [
  [/œ/g, 'oe'],
  [/æ/g, 'ae'],
]

export function normaliser(texte: string): string {
  let sansLigature = texte.toLowerCase()
  for (const [motif, remplacement] of LIGATURES) {
    sansLigature = sansLigature.replace(motif, remplacement)
  }

  return sansLigature
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
}

/** Découpe une saisie en termes utiles. Les termes trop courts sont écartés,
 *  pas la recherche entière : « TP moteur » doit fonctionner. */
export function termes(saisie: string): readonly string[] {
  return normaliser(saisie)
    .split(' ')
    .filter((terme) => terme.length >= LONGUEUR_MINIMALE)
}

/**
 * Score d'une leçon. `0` signifie « ne correspond pas ».
 *
 * Le titre pèse plus que le chapitre : quelqu'un qui cherche « attelage »
 * veut la leçon sur l'attelage, pas les douze leçons d'un chapitre qui
 * s'appelle « Attelage et sécurité ».
 *
 * **Tous les termes doivent correspondre** — un ET, pas un OU. Chercher
 * « sécurité attelage » pour obtenir toutes les leçons contenant « sécurité »
 * donne une liste que personne ne lit.
 */
export function score(sujet: Cherchable, recherches: readonly string[]): number {
  if (recherches.length === 0) return 0

  const titre = normaliser(sujet.titre)
  const chapitre = normaliser(sujet.chapitre)

  let total = 0

  for (const terme of recherches) {
    const dansTitre = titre.includes(terme)
    const dansChapitre = chapitre.includes(terme)

    if (!dansTitre && !dansChapitre) return 0

    // Un mot entier vaut mieux qu'un fragment : « moteur » doit remonter
    // « Le moteur » avant « Motorisation ».
    const entier = new RegExp(`(^| )${terme}( |$)`).test(titre)

    total += dansTitre ? (entier ? 10 : 6) : 2
  }

  return total
}

export type Resultat<T> = {
  readonly sujet: T
  readonly score: number
}

/**
 * Cherche et classe. Renvoie une liste vide si la saisie ne contient aucun
 * terme exploitable — et non la liste entière : afficher tout le catalogue
 * parce que quelqu'un a tapé « a » ferait croire à un résultat.
 */
export function chercher<T extends Cherchable>(
  sujets: readonly T[],
  saisie: string,
  limite = 30,
): readonly Resultat<T>[] {
  const recherches = termes(saisie)
  if (recherches.length === 0) return []

  return sujets
    .map((sujet) => ({ sujet, score: score(sujet, recherches) }))
    .filter((resultat) => resultat.score > 0)
    .sort((a, b) =>
      // À score égal, l'ordre alphabétique : un classement instable donnerait
      // deux listes différentes pour la même recherche.
      b.score - a.score || a.sujet.titre.localeCompare(b.sujet.titre, 'fr'),
    )
    .slice(0, limite)
}
