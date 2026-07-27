import type { IdentifiantLecon } from '@/noyau/identifiants'
import { echec, succes, type Resultat } from '@/noyau/resultat'
import { dureeEstimeeMinutes } from '../domaine/bloc'
import { validerPourPublication, versionSuivante } from '../domaine/lecon'
import type { DepotCatalogue } from '../ports/depot-catalogue'

export type PublicationReussie = {
  readonly dureeEstimeeMin: number
  /** Accessibilité, sous-titres manquants… : à montrer, pas à taire. */
  readonly alertes: readonly string[]
}

export async function publierLecon(
  leconId: IdentifiantLecon,
  depot: DepotCatalogue,
): Promise<Resultat<PublicationReussie>> {
  const lecon = await depot.chargerLecon(leconId)
  if (!lecon) return echec('introuvable', 'Leçon introuvable.')

  const validation = validerPourPublication(lecon)
  if (!validation.ok) return validation

  // La durée est recalculée à la publication, jamais saisie : un enseignant
  // n'a pas à estimer un temps de lecture, et il le sous-estimerait.
  const duree = dureeEstimeeMinutes(lecon.blocs)

  await depot.publier(leconId, duree, versionSuivante(lecon))

  return succes({ dureeEstimeeMin: duree, alertes: validation.valeur.alertes })
}
