/**
 * Politique anti-force brute sur le code à 4 chiffres.
 *
 * Un code à 4 chiffres, c'est 10 000 combinaisons : sans limitation, il tombe
 * en quelques secondes et le mode minimal n'a aucune valeur. Cette politique
 * est donc ce qui rend l'authentification des mineurs défendable — pas un
 * confort qu'on ajoute plus tard.
 *
 * Elle est pure : aucune horloge implicite, aucun accès base. L'instant est un
 * paramètre, ce qui la rend testable sans attendre une heure.
 */

export const ESSAIS_AVANT_VERROU = 5
export const FENETRE_MINUTES = 60

export type EtatVerrou = {
  readonly echecs: number
  readonly dernierEchec: Date
  readonly verrouilleJusqua: Date | null
}

export type DecisionVerrou =
  | { readonly type: 'autorise' }
  | { readonly type: 'verrouille'; readonly jusqua: Date }

export const AUCUN_VERROU: EtatVerrou = {
  echecs: 0,
  dernierEchec: new Date(0),
  verrouilleJusqua: null,
}

export function evaluerVerrou(etat: EtatVerrou, maintenant: Date): DecisionVerrou {
  if (etat.verrouilleJusqua && etat.verrouilleJusqua > maintenant) {
    return { type: 'verrouille', jusqua: etat.verrouilleJusqua }
  }
  return { type: 'autorise' }
}

const minutesEcoulees = (depuis: Date, jusqua: Date) =>
  (jusqua.getTime() - depuis.getTime()) / 60_000

/**
 * Après un échec. La fenêtre glisse : cinq erreurs étalées sur la journée ne
 * verrouillent pas — ce sont des élèves, ils se trompent de code.
 */
export function apresEchec(etat: EtatVerrou, maintenant: Date): EtatVerrou {
  const dansLaFenetre = minutesEcoulees(etat.dernierEchec, maintenant) < FENETRE_MINUTES
  const echecs = dansLaFenetre ? etat.echecs + 1 : 1

  if (echecs >= ESSAIS_AVANT_VERROU) {
    return {
      echecs,
      dernierEchec: maintenant,
      // Pas de déverrouillage automatique : c'est l'enseignant qui débloque.
      // Un verrou temporisé se contourne en attendant ; et un élève réellement
      // bloqué a de toute façon besoin qu'on lui redonne son code.
      verrouilleJusqua: new Date('9999-12-31T00:00:00.000Z'),
    }
  }

  return { echecs, dernierEchec: maintenant, verrouilleJusqua: null }
}

/** Après une authentification réussie, tout repart de zéro. */
export const apresSucces = (): EtatVerrou => AUCUN_VERROU

/** Déblocage explicite par un enseignant. */
export const debloquer = (): EtatVerrou => AUCUN_VERROU
