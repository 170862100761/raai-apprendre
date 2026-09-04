/**
 * Meilleur score par jeu, gardé dans le navigateur.
 *
 * Aucune écriture en base, aucune table : les jeux sont de l'entraînement
 * libre, pas de l'évaluation. Une table de scores devrait arriver avec sa
 * politique RLS et son cloisonnement par établissement — pour un chiffre que
 * seul l'élève regarde, ce serait payer le prix fort. Le jour où les scores
 * doivent alimenter la progression, ils passeront par le module
 * `gamification`, pas par ici.
 *
 * Conséquence assumée : le score ne suit pas l'élève d'un poste à l'autre.
 */

const PREFIXE = 'raai-apprendre.jeux.'

export interface MeilleurScore {
  /** Toujours « plus grand = meilleur », même pour le memory (coups inversés). */
  valeur: number
  /** Ce que l'élève lit : « 12/20 », « 14 coups »… */
  libelle: string
}

function lireBrut(cle: string): MeilleurScore | null {
  // `localStorage` peut lever (navigation privée verrouillée, stockage
  // désactivé) : un score qui ne se lit pas ne doit pas casser le jeu.
  try {
    const brut = window.localStorage.getItem(PREFIXE + cle)
    if (!brut) return null
    const objet: unknown = JSON.parse(brut)
    if (
      typeof objet === 'object' &&
      objet !== null &&
      typeof (objet as MeilleurScore).valeur === 'number' &&
      typeof (objet as MeilleurScore).libelle === 'string'
    ) {
      return objet as MeilleurScore
    }
    return null
  } catch {
    return null
  }
}

export function meilleurScore(cle: string): MeilleurScore | null {
  if (typeof window === 'undefined') return null
  return lireBrut(cle)
}

/** Ne garde que le meilleur : rejouer moins bien n'efface rien. */
export function enregistrerScore(cle: string, valeur: number, libelle: string): void {
  if (typeof window === 'undefined') return
  const actuel = lireBrut(cle)
  if (actuel && actuel.valeur >= valeur) return
  try {
    window.localStorage.setItem(PREFIXE + cle, JSON.stringify({ valeur, libelle }))
  } catch {
    // Même raison qu'à la lecture : le stockage est un confort, pas une garantie.
  }
}
