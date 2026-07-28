import { echec, succes, type Resultat } from '@/noyau/resultat'
import {
  nomSur,
  signatureValide,
  typePourExtension,
  type TypeAccepte,
} from './type-fichier'

/**
 * Décision d'accepter ou non un fichier.
 *
 * Pure : elle reçoit le nom, la taille et les premiers octets, et rend un
 * verdict. Aucune écriture, aucun réseau — donc testable sans stockage.
 */

export type DemandeTeleversement = {
  readonly nom: string
  readonly tailleOctets: number
  /** Les 64 premiers octets suffisent à toutes nos signatures. */
  readonly tete: Uint8Array
}

export type FichierAccepte = {
  readonly nom: string
  readonly type: TypeAccepte
}

export const OCTETS_DE_TETE = 64

export function validerTeleversement(
  demande: DemandeTeleversement,
): Resultat<FichierAccepte> {
  const type = typePourExtension(demande.nom)
  if (!type) {
    return echec(
      'donnees_invalides',
      `Ce format de fichier n’est pas accepté. ` +
        `Formats possibles : images PNG et JPEG, PDF, vidéo MP4, modèles 3D.`,
    )
  }

  if (demande.tailleOctets <= 0) {
    return echec('donnees_invalides', 'Fichier vide.')
  }

  if (demande.tailleOctets > type.tailleMaxOctets) {
    return echec(
      'donnees_invalides',
      `Fichier trop lourd : ${enMo(demande.tailleOctets)} Mo pour un maximum de ` +
        `${enMo(type.tailleMaxOctets)} Mo. Beaucoup d’établissements sont en zone ` +
        `rurale : un fichier lourd ne s’ouvrira pas en classe.`,
    )
  }

  // L'extension ne prouve rien : `schema.png` peut être tout autre chose.
  if (!signatureValide(type, demande.tete)) {
    return echec(
      'donnees_invalides',
      `Le contenu de ce fichier ne correspond pas à son extension. ` +
        `Vérifie que tu envoies bien un fichier ${type.extensions[0]?.toUpperCase()}.`,
    )
  }

  return succes({ nom: nomSur(demande.nom), type })
}

const enMo = (octets: number) => Math.round((octets / (1024 * 1024)) * 10) / 10
