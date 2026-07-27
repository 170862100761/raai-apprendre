/**
 * Résolution de la session — LE point de convergence des deux chemins
 * d'authentification.
 *
 * C'est le seul endroit du code qui a le droit de savoir d'où vient
 * l'utilisateur. Tout ce qui est en aval reçoit un `Session` et rien d'autre.
 * Si une branche `origine === …` apparaît ailleurs, c'est un défaut à corriger,
 * pas une commodité.
 */
import type {
  IdentifiantApprenant,
  IdentifiantCompte,
  JetonSession,
} from '@/noyau/identifiants'
import { SESSION_ANONYME, type Session } from '../domaine/session'
import type { DepotIdentite } from '../ports/depot-identite'

/** Ce que le middleware a lu dans les cookies. Rien de plus. */
export type Preuves = {
  readonly compteId?: IdentifiantCompte | null
  readonly jetonApprenant?: JetonSession | null
}

export async function resoudreSession(
  preuves: Preuves,
  depot: DepotIdentite,
): Promise<Session> {
  // Le compte adulte prime : si les deux cookies coexistent — un formateur qui
  // a testé un accès élève sur son poste — c'est l'identité la plus forte qui
  // l'emporte, jamais un cumul de droits.
  if (preuves.compteId) {
    const profil = await depot.chargerProfilCompte(preuves.compteId)
    if (!profil) return SESSION_ANONYME

    return {
      sujetId: profil.compteId,
      attributions: profil.attributions,
      etablissementId: profil.etablissementId,
      classes: profil.classes,
      origine: 'compte',
    }
  }

  if (preuves.jetonApprenant) {
    const stockee = await depot.resoudreJetonApprenant(preuves.jetonApprenant)
    if (!stockee) return SESSION_ANONYME

    return {
      sujetId: stockee.apprenantId,
      // Un apprenant n'a qu'une attribution, et elle ne porte que sur lui-même.
      attributions: [{ role: 'apprenant', portee: { type: 'soi' } }],
      etablissementId: stockee.etablissementId,
      classes: [],
      origine: 'jeton_apprenant',
    }
  }

  return SESSION_ANONYME
}

/**
 * Variante exigeante, pour les cas d'usage qui n'ont rien à faire d'une session
 * anonyme. Renvoie `null` plutôt que de lever : c'est à l'appelant de décider
 * s'il redirige ou s'il affiche une erreur.
 */
export async function resoudreSessionAuthentifiee(
  preuves: Preuves,
  depot: DepotIdentite,
): Promise<Session | null> {
  const session = await resoudreSession(preuves, depot)
  return session.sujetId === null ? null : session
}

export type SujetId = IdentifiantCompte | IdentifiantApprenant
