/**
 * LA session — au singulier.
 *
 * C'est la pièce la plus délicate du projet. Deux chemins d'authentification
 * coexistent (compte Supabase Auth pour les adultes, jeton pour les élèves
 * mineurs sans compte), et deux chemins mal isolés produisent des failles :
 * on finit par oublier une branche, et c'est toujours celle qui protège les
 * mineurs.
 *
 * La règle est donc absolue : **au-delà de la résolution de session, plus une
 * seule ligne de code ne sait d'où vient l'utilisateur.** Pas de
 * `if (estEleveMinimal)` dans un cas d'usage, un composant ou une politique.
 * Le champ `origine` existe pour l'audit et pour rien d'autre.
 */
import type {
  IdentifiantAcademie,
  IdentifiantApprenant,
  IdentifiantClasse,
  IdentifiantCompte,
  IdentifiantEtablissement,
} from '@/noyau/identifiants'

export type Role =
  | 'admin_national'
  | 'admin_academie'
  | 'admin_etablissement'
  | 'responsable_pedagogique'
  | 'enseignant'
  | 'apprenant'
  | 'parent'

/**
 * Un rôle seul ne veut rien dire : « enseignant » ne dit pas de quelles
 * classes. La portée complète le rôle, et les attributions s'additionnent —
 * un enseignant est souvent aussi responsable pédagogique d'une formation.
 */
export type Portee =
  | { readonly type: 'nationale' }
  | { readonly type: 'academie'; readonly academieId: IdentifiantAcademie }
  | { readonly type: 'etablissement'; readonly etablissementId: IdentifiantEtablissement }
  | { readonly type: 'classe'; readonly classeId: IdentifiantClasse }
  | { readonly type: 'soi' }

export type Attribution = {
  readonly role: Role
  readonly portee: Portee
}

/** Conservée pour l'audit uniquement. Aucune décision métier ne s'y appuie. */
export type OrigineSession = 'compte' | 'jeton_apprenant' | 'aucune'

export type Session = {
  /** Compte pour un adulte, apprenant pour un élève. Jamais les deux. */
  readonly sujetId: IdentifiantCompte | IdentifiantApprenant | null
  readonly attributions: readonly Attribution[]
  /** Null pour un administrateur national ou un visiteur. */
  readonly etablissementId: IdentifiantEtablissement | null
  /** Vide pour qui n'encadre aucune classe. */
  readonly classes: readonly IdentifiantClasse[]
  readonly origine: OrigineSession
}

export const SESSION_ANONYME: Session = {
  sujetId: null,
  attributions: [],
  etablissementId: null,
  classes: [],
  origine: 'aucune',
}

export const estAuthentifie = (session: Session): boolean => session.sujetId !== null

export const roles = (session: Session): readonly Role[] =>
  session.attributions.map((a) => a.role)

export const aRole = (session: Session, ...recherches: readonly Role[]): boolean =>
  session.attributions.some((a) => recherches.includes(a.role))

export const encadreClasse = (session: Session, classeId: IdentifiantClasse): boolean =>
  session.classes.includes(classeId)

/**
 * Vrai si la session porte au moins une attribution couvrant l'établissement.
 * Une portée nationale couvre tout ; une portée académique couvre les
 * établissements de son académie, ce que seule la couche application peut
 * savoir — d'où la résolution en amont, dans `etablissementId`.
 */
export function couvreEtablissement(
  session: Session,
  etablissementId: IdentifiantEtablissement,
): boolean {
  if (session.attributions.some((a) => a.portee.type === 'nationale')) return true
  return session.etablissementId === etablissementId
}
