/**
 * Le journal, côté lecture.
 *
 * Écrire une trace ne sert à rien si personne ne peut la lire. Cet écran est
 * ce qui transforme une obligation RGPD en outil : quand un établissement
 * demande « qui a modifié cette note ? », il faut pouvoir répondre sans passer
 * par un développeur avec un accès à la base.
 *
 * Ce module est pur : il met en forme des lignes déjà lues, il n'interroge
 * rien. La restriction d'accès vit dans la fonction SQL, pas ici.
 */
import type { ActionAuditee } from './evenement'

/**
 * Ce que `lire_journal` renvoie — quatre colonnes, pas une de plus.
 *
 * Ni sujet, ni ressource, ni adresse IP : savoir QUI précisément a agi est une
 * enquête, pas une consultation courante. L'écran répond à « que s'est-il
 * passé ici », et il faut une demande motivée pour aller au-delà.
 */
export type LigneJournal = {
  readonly action: ActionAuditee
  readonly ressourceType: string
  readonly roleEffectif: string
  readonly survenuLe: Date
}

/**
 * Libellés en clair. `Record` complet et non `Partial` : ajouter une action à
 * `ActionAuditee` sans lui écrire de libellé ne compile pas. Un journal qui
 * affiche `lecon.depubliee` à un directeur de MFR ne lui sert à rien.
 */
const LIBELLES: Record<ActionAuditee, string> = {
  'connexion.reussie': 'Connexion',
  'connexion.echouee': 'Échec de connexion',
  'connexion.verrouillage': 'Accès verrouillé après cinq échecs',
  deconnexion: 'Déconnexion',

  'apprenant.cree': 'Élève ajouté',
  'apprenant.acces_remis': 'Accès élève réinitialisé',
  'classe.creee': 'Classe créée',
  'membre.modifie': 'Droits d’un membre modifiés',

  'copie.rendue': 'Copie rendue',
  'note.modifiee': 'Note modifiée',
  'competence.declaree': 'Compétence déclarée',

  'lecon.publiee': 'Leçon publiée',
  'lecon.depubliee': 'Leçon dépubliée',
  'evaluation.publiee': 'Évaluation publiée',
  'evaluation.depubliee': 'Évaluation dépubliée',
  'ressource.deposee': 'Ressource déposée',

  'export.produit': 'Export produit',
  'donnees.consultees': 'Données personnelles consultées',
  'apprenant.efface': 'Élève effacé (droit à l’effacement)',

  'abonnement.souscrit': 'Souscription d’un abonnement',
  'abonnement.gere': 'Ouverture du portail d’abonnement',

  'session.impersonnee': 'Connexion au nom d’un autre compte',
}

export const libelle = (action: ActionAuditee): string => LIBELLES[action]

/**
 * Actions à faire remarquer.
 *
 * Elles ne sont pas anormales — un accès remis est une opération courante —
 * mais ce sont celles qu'un directeur doit pouvoir justifier si on les lui
 * oppose. Les distinguer visuellement évite d'avoir à lire trois cents lignes
 * pour trouver la seule qui compte.
 */
const A_SIGNALER: ReadonlySet<ActionAuditee> = new Set([
  'connexion.verrouillage',
  'membre.modifie',
  'note.modifiee',
  'apprenant.acces_remis',
  'donnees.consultees',
  'apprenant.efface',
  'session.impersonnee',
])

export const aSignaler = (action: ActionAuditee): boolean => A_SIGNALER.has(action)

const ROLES: Readonly<Record<string, string>> = {
  admin_national: 'Administration nationale',
  admin_academie: 'Académie',
  admin_etablissement: 'Direction',
  responsable_pedagogique: 'Responsable pédagogique',
  enseignant: 'Enseignant',
  tuteur: 'Tuteur',
  apprenant: 'Élève',
  anonyme: 'Non identifié',
}

/** Un rôle inconnu est affiché tel quel plutôt que masqué : une trace qu'on ne
 * sait pas nommer reste une trace, et la cacher serait pire. */
export const libelleRole = (role: string): string => ROLES[role] ?? role

export type JourneeJournal = {
  readonly jour: string
  readonly lignes: readonly LigneJournal[]
}

/**
 * Regroupe par journée, en conservant l'ordre reçu (le plus récent d'abord).
 *
 * Découper par jour est ce qui rend le journal lisible : une question posée à
 * un établissement porte toujours sur une date — « que s'est-il passé le
 * 12 mars ? » — jamais sur un rang dans une liste.
 */
export function parJournee(lignes: readonly LigneJournal[]): readonly JourneeJournal[] {
  const journees: JourneeJournal[] = []

  for (const ligne of lignes) {
    const jour = ligne.survenuLe.toISOString().slice(0, 10)
    const derniere = journees[journees.length - 1]

    if (derniere && derniere.jour === jour) {
      ;(derniere.lignes as LigneJournal[]).push(ligne)
      continue
    }

    journees.push({ jour, lignes: [ligne] })
  }

  return journees
}
