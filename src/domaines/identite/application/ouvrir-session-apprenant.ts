/**
 * Ouverture de session d'un élève en mode minimal : identifiant + code à
 * 4 chiffres, aucun compte Auth, aucune donnée personnelle.
 */
import { echec, succes, type Resultat } from '@/noyau/resultat'
import type { JetonSession } from '@/noyau/identifiants'
import {
  apresEchec,
  apresSucces,
  AUCUN_VERROU,
  evaluerVerrou,
} from '../domaine/verrou'
import type { DepotIdentite, Hachage, Horloge } from '../ports/depot-identite'

export const DUREE_SESSION_JOURS = 30

export type Entree = {
  readonly identifiant: string
  readonly code: string
}

export type Dependances = {
  readonly depot: DepotIdentite
  readonly hachage: Hachage
  readonly horloge: Horloge
}

/**
 * Message unique pour « identifiant inconnu » et « code faux ».
 *
 * Distinguer les deux permettrait d'énumérer les identifiants valides d'un
 * établissement, puis de concentrer la force brute dessus.
 */
const REFUS = "Identifiant ou code incorrect."

export async function ouvrirSessionApprenant(
  entree: Entree,
  { depot, hachage, horloge }: Dependances,
): Promise<Resultat<{ jeton: JetonSession }>> {
  const identifiant = entree.identifiant.trim().toLowerCase()

  if (!/^\d{4}$/.test(entree.code)) {
    return echec('donnees_invalides', REFUS, { code: 'Le code comporte 4 chiffres.' })
  }

  const maintenant = horloge.maintenant()
  const verrou = (await depot.lireVerrou(identifiant)) ?? AUCUN_VERROU

  // Le verrou se vérifie AVANT toute lecture d'apprenant : un compte verrouillé
  // ne doit même pas déclencher de comparaison bcrypt.
  const decision = evaluerVerrou(verrou, maintenant)
  if (decision.type === 'verrouille') {
    return echec(
      'compte_verrouille',
      "Trop d'essais. Demande à ton formateur de débloquer ton accès.",
    )
  }

  const apprenant = await depot.trouverApprenantParIdentifiant(identifiant)

  // On compare le code même quand l'apprenant n'existe pas, contre un condensat
  // factice : sans cela, le temps de réponse trahit l'existence du compte.
  const hache = apprenant?.codeHash ?? CONDENSAT_FACTICE
  const codeValide = await hachage.verifier(entree.code, hache)

  if (!apprenant || !apprenant.actif || !codeValide) {
    await depot.ecrireVerrou(identifiant, apresEchec(verrou, maintenant))
    return echec('non_authentifie', REFUS)
  }

  await depot.ecrireVerrou(identifiant, apresSucces())

  const expireLe = new Date(maintenant.getTime() + DUREE_SESSION_JOURS * 86_400_000)
  const jeton = await depot.creerSessionApprenant(apprenant.id, expireLe)
  await depot.marquerVu(apprenant.id)

  return succes({ jeton })
}

/** bcrypt d'une valeur qui n'est le code de personne. Sert à égaliser les temps. */
const CONDENSAT_FACTICE = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'
