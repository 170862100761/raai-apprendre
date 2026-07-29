import type { IdentifiantApprenant, IdentifiantEtablissement } from '@/noyau/identifiants'
import { echec, succes, type Resultat } from '@/noyau/resultat'
import {
  anonymiser,
  contientUnTiers,
  resteIdentifiable,
  type DossierRgpd,
} from '../domaine/dossier-rgpd'
import type { DepotOrganisation } from '../ports/depot-organisation'

/**
 * Le dossier d'un élève, prêt à être remis (art. 20).
 *
 * Le contrôle anti-tiers tourne **à chaque export**, pas seulement dans les
 * tests : une jointure ajoutée dans six mois n'aura pas la politesse de casser
 * une assertion, et un dossier qui part avec les prénoms de vingt-neuf
 * camarades est une violation de données, pas un défaut d'affichage.
 *
 * En cas de doute, on refuse plutôt que de remettre. Un export bloqué se
 * corrige ; un export parti ne se rattrape pas.
 */
export async function exporterDossier(
  apprenantId: IdentifiantApprenant,
  etablissementId: IdentifiantEtablissement,
  depot: DepotOrganisation,
): Promise<Resultat<DossierRgpd>> {
  const dossier = await depot.assemblerDossier(apprenantId, etablissementId)
  if (!dossier) return echec('introuvable', 'Élève introuvable dans cet établissement.')

  const camarades = await depot.prenomsDesCamarades(apprenantId, etablissementId)
  if (contientUnTiers(dossier, camarades)) {
    return echec(
      'regle_metier',
      "L'export contient le prénom d'un autre élève : il n'est pas remis. " +
        'Signale-le, cette situation est un défaut du logiciel.',
    )
  }

  return succes(dossier)
}

export type EffacementFait = {
  readonly apprenantId: IdentifiantApprenant
  /** Ce qui reste en base, et qui est délibérément conservé. */
  readonly conserve: string
}

/**
 * Efface un élève au sens du droit à l'effacement (art. 17).
 *
 * **Anonymisation, pas suppression** — c'est la décision du document 09 §5.
 * Supprimer les lignes ferait mentir la couverture du référentiel d'une classe
 * entière, des mois plus tard, sans que personne ne relie la cause à l'effet.
 * On retire ce qui identifie, on garde ce qui compte.
 *
 * La relecture après écriture n'est pas de la méfiance envers Prisma : c'est
 * qu'une anonymisation à moitié appliquée est pire que pas d'anonymisation du
 * tout, parce qu'on croit le dossier clos. Mieux vaut une erreur bruyante.
 */
export async function effacerApprenant(
  apprenantId: IdentifiantApprenant,
  etablissementId: IdentifiantEtablissement,
  depot: DepotOrganisation,
): Promise<Resultat<EffacementFait>> {
  const existe = await depot.assemblerDossier(apprenantId, etablissementId)
  if (!existe) return echec('introuvable', 'Élève introuvable dans cet établissement.')

  await depot.anonymiserApprenant(apprenantId, etablissementId, anonymiser())

  const apres = await depot.relireApprenant(apprenantId)
  if (!apres) {
    return echec('erreur_interne', "L'élève a disparu au lieu d'être anonymisé.")
  }
  if (resteIdentifiable(apres)) {
    return echec(
      'erreur_interne',
      "L'anonymisation n'a pas été complètement appliquée. Ne pas considérer " +
        'cette demande comme traitée.',
    )
  }

  return succes({
    apprenantId,
    conserve:
      `${existe.acquis.length} acquis, ${existe.evaluations.length} évaluation(s) ` +
      'et les lectures, désormais rattachés à un élève anonyme — les ' +
      'statistiques de la classe restent justes.',
  })
}
