/**
 * Ouverture de session d'un adulte : email + mot de passe.
 *
 * TRANSITOIRE. Ce cas d'usage disparaîtra quand Supabase Auth sera ouvert —
 * c'est alors son JWT qui alimentera `resoudreSession`. Il vit derrière le
 * même port que la connexion élève, donc la bascule ne touchera ni les écrans
 * ni les autorisations.
 *
 * Le verrouillage anti-force brute est le même que pour les élèves : un mot de
 * passe d'enseignant protège l'accès aux données de trente mineurs, il mérite
 * au moins autant de soin qu'un code à 4 chiffres.
 */
import { echec, succes, type Resultat } from '@/noyau/resultat'
import type { JetonSession } from '@/noyau/identifiants'
import { apresEchec, apresSucces, AUCUN_VERROU, evaluerVerrou } from '../domaine/verrou'
import type { DepotIdentite, Hachage, Horloge } from '../ports/depot-identite'

export const DUREE_SESSION_COMPTE_JOURS = 7

export type EntreeCompte = {
  readonly email: string
  readonly motDePasse: string
}

const REFUS = 'Adresse e-mail ou mot de passe incorrect.'

/** bcrypt d'une valeur qui n'est le mot de passe de personne. Égalise les temps. */
const CONDENSAT_FACTICE = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy'

export async function ouvrirSessionCompte(
  entree: EntreeCompte,
  {
    depot,
    hachage,
    horloge,
  }: { depot: DepotIdentite; hachage: Hachage; horloge: Horloge },
): Promise<Resultat<{ jeton: JetonSession }>> {
  const email = entree.email.trim().toLowerCase()

  if (email === '' || entree.motDePasse === '') {
    return echec('donnees_invalides', REFUS)
  }

  const maintenant = horloge.maintenant()
  const verrou = (await depot.lireVerrou(email)) ?? AUCUN_VERROU

  if (evaluerVerrou(verrou, maintenant).type === 'verrouille') {
    return echec(
      'compte_verrouille',
      "Trop d'essais. Contacte l'administrateur de ton établissement.",
    )
  }

  const compte = await depot.trouverCompteParEmail(email)
  const valide = await hachage.verifier(
    entree.motDePasse,
    compte?.motDePasseHash ?? CONDENSAT_FACTICE,
  )

  if (!compte || !compte.actif || !valide) {
    await depot.ecrireVerrou(email, apresEchec(verrou, maintenant))
    return echec('non_authentifie', REFUS)
  }

  await depot.ecrireVerrou(email, apresSucces())

  const expireLe = new Date(maintenant.getTime() + DUREE_SESSION_COMPTE_JOURS * 86_400_000)
  const jeton = await depot.creerSessionCompte(compte.id, expireLe)
  await depot.marquerVu(compte.id)

  return succes({ jeton })
}
