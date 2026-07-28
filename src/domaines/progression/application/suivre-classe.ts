import type { IdentifiantClasse } from '@/noyau/identifiants'
import { echec, succes, type Resultat } from '@/noyau/resultat'
import {
  competencesEnDifficulte,
  couvertureReferentiel,
  indexer,
  jamaisConnectes,
  sansConnexionRecente,
  type ColonneCompetence,
  type Grille,
  type LigneApprenant,
} from '../domaine/suivi'
import type { NiveauAcquisition } from '../domaine/acquisition'
import type { DepotProgression } from '../ports/depot-progression'

export type SuiviClasse = {
  readonly nomClasse: string
  readonly grille: Grille
  readonly index: ReadonlyMap<string, NiveauAcquisition>
  readonly couverture: number
  readonly bloquantes: readonly { competence: ColonneCompetence; partValidee: number }[]
  readonly aRelancer: readonly LigneApprenant[]
  readonly jamaisVenus: readonly LigneApprenant[]
}

/**
 * Tout ce qu'affiche l'écran de suivi, en une seule lecture.
 *
 * Les indicateurs sont dérivés ici et non calculés en base : ce sont des règles
 * pédagogiques, pas des requêtes, et elles doivent se tester sans base.
 */
export async function suivreClasse(
  classeId: IdentifiantClasse,
  depot: DepotProgression,
  maintenant: Date = new Date(),
): Promise<Resultat<SuiviClasse>> {
  const grille = await depot.lireGrilleClasse(classeId)
  if (!grille) return echec('introuvable', 'Classe introuvable.')

  const index = indexer(grille)

  return succes({
    nomClasse: grille.nomClasse,
    grille,
    index,
    couverture: couvertureReferentiel(grille, index),
    bloquantes: competencesEnDifficulte(grille, index),
    aRelancer: sansConnexionRecente(grille.apprenants, maintenant),
    jamaisVenus: jamaisConnectes(grille.apprenants),
  })
}
