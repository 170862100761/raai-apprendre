/**
 * Meilleur score par jeu : dans le navigateur d'abord, en base ensuite.
 *
 * Le navigateur répond tout de suite et sans réseau : c'est lui qui affiche
 * le « Meilleur » dès la fin de la partie. La base garde l'historique pour
 * l'élève connecté et fait compter la partie dans sa progression — mais elle
 * est appelée en arrière-plan, et un échec ne se voit pas : le module `jeux`
 * doit rester supprimable, et un jeu ne doit jamais se bloquer sur un score.
 */

import { enregistrerScoreJeu } from '../actions'

const PREFIXE = 'raai-apprendre.jeux.'

export interface MeilleurScore {
  /** Toujours « plus grand = meilleur », même pour le memory (coups inversés). */
  valeur: number
  /** Ce que l'élève lit : « 12/20 », « 14 coups »… */
  libelle: string
}

/**
 * Ce que la partie vaut, rapporté à un maximum : c'est la seule forme que la
 * progression sait lire. Les points de vitesse ou les coups du memory ne
 * traversent pas — `valeur` reste le classement local, `score / scoreMax` la
 * mesure de réussite.
 */
export interface PartieJouee {
  score: number
  scoreMax: number
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

/**
 * Garde la partie. Localement, seul le meilleur reste : rejouer moins bien
 * n'efface rien. En base, chaque partie est envoyée — le « meilleur » y est
 * une lecture, et une partie ratée compte aussi comme un signe pour l'élève.
 */
export function enregistrerScore(
  cle: string,
  valeur: number,
  libelle: string,
  partie: PartieJouee,
): void {
  if (typeof window === 'undefined') return

  const actuel = lireBrut(cle)
  if (!actuel || actuel.valeur < valeur) {
    try {
      window.localStorage.setItem(PREFIXE + cle, JSON.stringify({ valeur, libelle }))
    } catch {
      // Même raison qu'à la lecture : le stockage est un confort, pas une garantie.
    }
  }

  void enregistrerScoreJeu({
    jeu: cle,
    score: Math.max(0, Math.round(partie.score)),
    scoreMax: Math.max(1, Math.round(partie.scoreMax)),
  }).catch(() => {
    // Hors ligne, session expirée, module retiré : le score local suffit.
  })
}
