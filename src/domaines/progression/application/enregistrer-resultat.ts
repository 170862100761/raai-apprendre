import type { IdentifiantApprenant, IdentifiantCompetence } from '@/noyau/identifiants'
import { evaluerAcquisition, repartir, type Evolution } from '../domaine/acquisition'
import type { DepotProgression, EcritureAcquis } from '../ports/depot-progression'

export type ResultatAEnregistrer = {
  readonly apprenantId: IdentifiantApprenant
  readonly etablissementId: string
  readonly competences: readonly IdentifiantCompetence[]
  readonly score: number
  readonly scoreMax: number
  /** Identifiant de la tentative : un acquis doit dire d'où il vient. */
  readonly sourceId: string
  readonly survenuLe: Date
}

/**
 * Traduit une tentative corrigée en évolutions de compétences.
 *
 * N'écrit que ce qui change. Réécrire un acquis identique repousserait sa date
 * de constat, et ferait croire à une progression là où il n'y en a pas — avec
 * pour effet de fausser le décompte des sept jours qui mène à la maîtrise.
 */
export async function enregistrerResultat(
  entree: ResultatAEnregistrer,
  depot: DepotProgression,
): Promise<readonly Evolution[]> {
  if (entree.competences.length === 0) return []

  const constats = repartir(
    entree.competences,
    entree.score,
    entree.scoreMax,
    entree.survenuLe,
  )

  const existants = await depot.lireAcquis(entree.apprenantId, entree.competences)

  const evolutions = constats.map((constat) =>
    evaluerAcquisition(constat, existants.get(constat.competenceId) ?? null),
  )

  const aEcrire: EcritureAcquis[] = evolutions
    .filter((e) => e.modifie)
    .map((e) => ({
      apprenantId: entree.apprenantId,
      competenceId: e.competenceId,
      etablissementId: entree.etablissementId,
      niveau: e.niveau,
      score: e.score,
      origine: e.origine,
      sourceId: entree.sourceId,
      constateLe: entree.survenuLe,
    }))

  if (aEcrire.length > 0) await depot.ecrireAcquis(aEcrire)

  return evolutions
}
