import type { IdentifiantEtablissement } from '@/noyau/identifiants'
import { echec, succes, type Resultat } from '@/noyau/resultat'
import { OCTETS_DE_TETE, validerTeleversement } from '../domaine/televersement'
import type { DepotMediatheque, StockageObjet } from '../ports/stockage'

export type Televersement = {
  readonly etablissementId: IdentifiantEtablissement
  readonly nom: string
  readonly contenu: Uint8Array
}

export type RessourceCreee = {
  readonly ressourceId: string
  readonly nom: string
  readonly typeMime: string
}

/**
 * Réception d'un fichier.
 *
 * L'ordre compte : on valide **avant** d'écrire quoi que ce soit. Écrire puis
 * vérifier laisserait des fichiers refusés sur le disque, et c'est exactement
 * ainsi qu'un stockage devient un dépôt d'objets non identifiés.
 */
export async function televerser(
  entree: Televersement,
  {
    depot,
    stockage,
    identifiant,
  }: {
    depot: DepotMediatheque
    stockage: StockageObjet
    /** Injecté pour rendre le chemin prévisible en test. */
    identifiant: () => string
  },
): Promise<Resultat<RessourceCreee>> {
  const validation = validerTeleversement({
    nom: entree.nom,
    tailleOctets: entree.contenu.byteLength,
    tete: entree.contenu.slice(0, OCTETS_DE_TETE),
  })
  if (!validation.ok) return validation

  const { nom, type } = validation.valeur
  const id = identifiant()

  // Le chemin est un UUID, jamais le nom fourni : un nom d'utilisateur dans un
  // chemin de stockage est une traversée de répertoire en puissance. Le
  // cloisonnement par établissement est repris dans le chemin, ce qui rend une
  // fuite visible à l'œil nu lors d'un audit.
  const chemin = `${entree.etablissementId}/${id}`

  await stockage.ecrire(chemin, entree.contenu, type.mime)

  const ressourceId = await depot.enregistrer({
    etablissementId: entree.etablissementId,
    nom,
    typeMime: type.mime,
    cheminStockage: chemin,
    tailleOctets: entree.contenu.byteLength,
  })

  return succes({ ressourceId, nom, typeMime: type.mime })
}

export type MediaServi = {
  readonly contenu: Uint8Array
  readonly typeMime: string
  readonly nom: string
  /** Faux → servi en téléchargement, jamais rendu dans notre origine. */
  readonly affichable: boolean
}

export async function servirMedia(
  ressourceId: string,
  {
    depot,
    stockage,
  }: { depot: DepotMediatheque; stockage: StockageObjet },
  typeEstAffichable: (mime: string) => boolean,
): Promise<Resultat<MediaServi>> {
  const ressource = await depot.charger(ressourceId)
  if (!ressource) return echec('introuvable', 'Média introuvable.')

  const contenu = await stockage.lire(ressource.cheminStockage)
  if (!contenu) return echec('introuvable', 'Média introuvable.')

  return succes({
    contenu,
    typeMime: ressource.typeMime,
    nom: ressource.nom,
    affichable: typeEstAffichable(ressource.typeMime),
  })
}
