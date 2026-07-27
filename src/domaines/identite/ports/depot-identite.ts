/**
 * Ce dont la couche application a besoin. Rien de plus, rien de Prisma.
 *
 * Le port décrit le besoin métier ; l'adaptateur choisit la technologie. C'est
 * ce qui permet de tester les cas d'usage sans base, et de remplacer Prisma
 * sans toucher au domaine.
 */
import type {
  IdentifiantApprenant,
  IdentifiantClasse,
  IdentifiantCompte,
  IdentifiantEtablissement,
  JetonSession,
} from '@/noyau/identifiants'
import type { Attribution } from '../domaine/session'
import type { EtatVerrou } from '../domaine/verrou'

export type ApprenantAuthentifiable = {
  readonly id: IdentifiantApprenant
  readonly etablissementId: IdentifiantEtablissement
  readonly codeHash: string
  readonly actif: boolean
}

export type SessionApprenantStockee = {
  readonly apprenantId: IdentifiantApprenant
  readonly etablissementId: IdentifiantEtablissement
}

export type ProfilCompte = {
  readonly compteId: IdentifiantCompte
  readonly attributions: readonly Attribution[]
  readonly etablissementId: IdentifiantEtablissement | null
  readonly classes: readonly IdentifiantClasse[]
}

export interface DepotIdentite {
  /** `null` si l'identifiant n'existe pas — le cas d'usage ne le distingue pas d'un code faux. */
  trouverApprenantParIdentifiant(identifiant: string): Promise<ApprenantAuthentifiable | null>

  lireVerrou(identifiant: string): Promise<EtatVerrou | null>
  ecrireVerrou(identifiant: string, etat: EtatVerrou): Promise<void>

  creerSessionApprenant(
    apprenantId: IdentifiantApprenant,
    expireLe: Date,
  ): Promise<JetonSession>

  /** `null` si le jeton est inconnu, expiré ou révoqué. */
  resoudreJetonApprenant(jeton: JetonSession): Promise<SessionApprenantStockee | null>

  revoquerSessionsApprenant(apprenantId: IdentifiantApprenant): Promise<void>

  /** Attributions non expirées d'un compte adulte, avec ses classes encadrées. */
  chargerProfilCompte(compteId: IdentifiantCompte): Promise<ProfilCompte | null>

  marquerVu(sujetId: IdentifiantApprenant | IdentifiantCompte): Promise<void>
}

/** Isolé pour rester remplaçable et testable sans coût de calcul bcrypt. */
export interface Hachage {
  verifier(clair: string, hache: string): Promise<boolean>
  hacher(clair: string): Promise<string>
}

export interface Horloge {
  maintenant(): Date
}

export const HORLOGE_SYSTEME: Horloge = { maintenant: () => new Date() }
