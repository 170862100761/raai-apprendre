/**
 * Autorisation applicative.
 *
 * La RLS protège les *données* : même un bug ici ne peut pas faire fuir les
 * lignes d'un autre établissement. Cette couche-ci protège les *actions* —
 * « publier une leçon », « modifier une note » ne se réduisent pas à l'écriture
 * d'une ligne — et produit des messages utiles.
 *
 * Les deux existent. Ne jamais retirer l'une sous prétexte que l'autre est là.
 */
import type {
  IdentifiantApprenant,
  IdentifiantClasse,
  IdentifiantEtablissement,
} from '@/noyau/identifiants'
import { aRole, couvreEtablissement, encadreClasse, type Role, type Session } from './session'

export type Action =
  // Contenu
  | 'lecon.lire'
  | 'lecon.ecrire'
  | 'lecon.publier'
  | 'lecon.supprimer'
  // Évaluation
  | 'evaluation.ecrire'
  | 'evaluation.passer'
  | 'evaluation.corriger'
  | 'note.modifier'
  // Progression
  | 'progression.lire_la_sienne'
  | 'progression.lire_classe'
  | 'competence.declarer'
  // Organisation
  | 'classe.creer'
  | 'classe.gerer'
  | 'apprenant.creer'
  | 'apprenant.lire_nominatif'
  | 'membre.gerer'
  | 'etablissement.gerer'
  | 'journal.consulter'
  // Pilotage
  | 'statistiques.etablissement'
  | 'statistiques.nationales'
  | 'export.produire'
  // National
  | 'referentiel.publier'
  | 'bibliotheque.moderer'
  // Support
  | 'session.impersonner'

export type ContexteAutorisation = {
  readonly etablissementId?: IdentifiantEtablissement
  readonly classeId?: IdentifiantClasse
  readonly apprenantId?: IdentifiantApprenant
  /** Vrai si la cible est un mineur en mode minimal. */
  readonly cibleEstMineur?: boolean
}

export type Decision =
  | { readonly autorise: true }
  | { readonly autorise: false; readonly motif: string }

const OUI: Decision = { autorise: true }
const non = (motif: string): Decision => ({ autorise: false, motif })

/** Rôles suffisants par action, avant application des restrictions de portée. */
const ROLES_REQUIS: Record<Action, readonly Role[]> = {
  'lecon.lire': ['admin_national', 'admin_academie', 'admin_etablissement',
                 'responsable_pedagogique', 'enseignant', 'apprenant', 'parent'],
  'lecon.ecrire': ['admin_etablissement', 'responsable_pedagogique', 'enseignant'],
  'lecon.publier': ['admin_etablissement', 'responsable_pedagogique', 'enseignant'],
  'lecon.supprimer': ['admin_etablissement', 'responsable_pedagogique', 'enseignant'],

  'evaluation.ecrire': ['admin_etablissement', 'responsable_pedagogique', 'enseignant'],
  'evaluation.passer': ['apprenant'],
  'evaluation.corriger': ['enseignant'],
  'note.modifier': ['enseignant'],

  'progression.lire_la_sienne': ['apprenant'],
  'progression.lire_classe': ['admin_etablissement', 'responsable_pedagogique', 'enseignant'],
  'competence.declarer': ['enseignant'],

  'classe.creer': ['admin_etablissement'],
  'classe.gerer': ['admin_etablissement', 'responsable_pedagogique'],
  'apprenant.creer': ['admin_etablissement', 'enseignant'],
  'apprenant.lire_nominatif': ['admin_etablissement', 'responsable_pedagogique', 'enseignant'],
  'membre.gerer': ['admin_etablissement'],
  'etablissement.gerer': ['admin_etablissement'],
  // Doit rester identique à `lire_journal` côté SQL. Si les deux divergent,
  // c'est le SQL qui fait foi — l'écran afficherait un lien vers une page vide.
  'journal.consulter': ['admin_etablissement'],

  'statistiques.etablissement': ['admin_etablissement', 'responsable_pedagogique'],
  'statistiques.nationales': ['admin_national', 'admin_academie'],
  'export.produire': ['admin_etablissement', 'responsable_pedagogique', 'enseignant'],

  'referentiel.publier': ['admin_national'],
  'bibliotheque.moderer': ['admin_national'],

  'session.impersonner': ['admin_national'],
}

/**
 * Interdictions qui l'emportent sur le rôle.
 *
 * Elles ne sont pas cosmétiques : ce sont les garanties qu'on donne aux
 * établissements et aux familles. Les exprimer ici, avant la matrice, les rend
 * impossibles à contourner par ajout d'un rôle.
 */
function interditAbsolu(
  session: Session,
  action: Action,
  contexte: ContexteAutorisation,
): Decision | null {
  // Un administrateur de la plateforme nationale n'a aucune raison légitime
  // d'accéder aux copies d'un élève de MFR. Les vues nationales sont agrégées.
  if (
    aRole(session, 'admin_national', 'admin_academie') &&
    !aRole(session, 'enseignant', 'responsable_pedagogique', 'admin_etablissement')
  ) {
    if (action === 'apprenant.lire_nominatif' || action === 'progression.lire_classe') {
      return non(
        "Un administrateur national ne consulte pas de données nominatives d'élèves. " +
          'Les statistiques nationales sont agrégées.',
      )
    }
  }

  // Le responsable pédagogique pilote, il n'évalue pas à la place des
  // enseignants. Sans cette limite, la responsabilité de la note se dilue.
  if (
    aRole(session, 'responsable_pedagogique', 'admin_etablissement') &&
    !aRole(session, 'enseignant')
  ) {
    if (action === 'note.modifier' || action === 'competence.declarer') {
      return non(
        "Seul l'enseignant de la classe modifie une note ou déclare une compétence.",
      )
    }
  }

  // L'impersonation de support est journalisée et limitée — mais elle est
  // purement et simplement interdite sur un compte d'élève mineur.
  if (action === 'session.impersonner' && contexte.cibleEstMineur === true) {
    return non("L'impersonation d'un compte d'élève mineur est interdite.")
  }

  // Un parent n'accède ni aux productions détaillées ni aux messages.
  if (aRole(session, 'parent') && session.attributions.length === 1) {
    if (action !== 'lecon.lire' && action !== 'progression.lire_la_sienne') {
      return non("Un parent accède à la progression, pas aux productions détaillées.")
    }
  }

  return null
}

export function peut(
  session: Session,
  action: Action,
  contexte: ContexteAutorisation = {},
): Decision {
  if (session.sujetId === null) return non('Session absente.')

  const interdit = interditAbsolu(session, action, contexte)
  if (interdit) return interdit

  const requis = ROLES_REQUIS[action]
  if (!aRole(session, ...requis)) {
    return non(`Action « ${action} » hors des droits de ce compte.`)
  }

  // Cloisonnement : une portée nationale traverse, le reste non.
  if (contexte.etablissementId && !couvreEtablissement(session, contexte.etablissementId)) {
    return non('Ressource hors du périmètre de cet établissement.')
  }

  // Portée « ses classes ». Sans affectation, un enseignant ne voit aucun élève.
  if (contexte.classeId && aRole(session, 'enseignant') && !aRole(session, 'admin_national')) {
    const encadrant =
      encadreClasse(session, contexte.classeId) ||
      aRole(session, 'responsable_pedagogique', 'admin_etablissement')

    if (!encadrant) return non("Cette classe n'est pas encadrée par ce compte.")
  }

  // Un apprenant n'accède qu'à ses propres données — même au sein de sa classe.
  if (aRole(session, 'apprenant') && !aRole(session, 'enseignant')) {
    if (contexte.apprenantId && contexte.apprenantId !== session.sujetId) {
      return non("Un apprenant n'accède qu'à ses propres données.")
    }
  }

  return OUI
}

/** Forme booléenne, quand le motif ne sera pas affiché. */
export const autorise = (
  session: Session,
  action: Action,
  contexte?: ContexteAutorisation,
): boolean => peut(session, action, contexte).autorise
