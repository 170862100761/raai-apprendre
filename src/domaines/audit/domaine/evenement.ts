/**
 * Le journal d'audit.
 *
 * Obligation RGPD, mais surtout condition pour qu'un établissement puisse
 * répondre à « qui a modifié cette note ? » — question qui finit toujours par
 * être posée, et à laquelle « on ne sait pas » est une réponse inacceptable.
 *
 * **Ce journal ne recopie jamais les données.** Un journal qui enregistre le
 * contenu devient lui-même une base de données personnelles, avec sa propre
 * durée de conservation, ses propres droits d'accès et ses propres risques de
 * fuite. On enregistre QUI a fait QUOI SUR QUOI, jamais la valeur.
 */

/**
 * Liste fermée. Ajouter une action ici est une décision : cela veut dire qu'on
 * juge l'action assez sensible pour être conservée trois ans.
 */
export type ActionAuditee =
  // Authentification
  | 'connexion.reussie'
  | 'connexion.echouee'
  | 'connexion.verrouillage'
  | 'deconnexion'
  // Comptes et accès
  | 'apprenant.cree'
  | 'apprenant.acces_remis'
  | 'classe.creee'
  | 'membre.modifie'
  // Évaluation — le cœur de ce qu'un établissement doit pouvoir justifier
  | 'copie.rendue'
  | 'note.modifiee'
  | 'competence.declaree'
  // Contenu
  | 'lecon.publiee'
  | 'lecon.depubliee'
  | 'ressource.deposee'
  // Données personnelles
  | 'export.produit'
  | 'donnees.consultees'
  /** Droit à l'effacement : anonymisation d'un élève, irréversible. */
  | 'apprenant.efface'
  // Facturation — qui engage l'établissement financièrement, et quand
  | 'abonnement.souscrit'
  | 'abonnement.gere'
  // Support
  | 'session.impersonnee'

export type TypeSujet = 'compte' | 'apprenant' | 'anonyme' | 'systeme'

export type EvenementAudit = {
  readonly sujetId: string | null
  readonly sujetType: TypeSujet
  /** Rôle réellement exercé au moment de l'action, pas celui du compte. */
  readonly roleEffectif: string
  readonly action: ActionAuditee
  readonly ressourceType: string
  readonly ressourceId: string | null
  readonly etablissementId: string | null
  readonly idRequete: string
  readonly ipTronquee: string | null
}

/**
 * Tronque une adresse IP.
 *
 * On garde de quoi reconnaître un réseau — une salle informatique, un
 * établissement — sans identifier un poste. Le dernier octet en IPv4, les 80
 * derniers bits en IPv6. Conserver l'adresse entière ferait de chaque ligne du
 * journal une donnée personnelle supplémentaire, pour un gain d'enquête nul.
 */
export function tronquerIp(ip: string | null | undefined): string | null {
  if (!ip) return null

  const premiere = ip.split(',')[0]?.trim()
  if (!premiere) return null

  if (premiere.includes('.')) {
    const octets = premiere.split('.')
    if (octets.length !== 4) return null
    return `${octets[0]}.${octets[1]}.${octets[2]}.0`
  }

  if (premiere.includes(':')) {
    const groupes = premiere.split(':').filter((g) => g !== '')
    if (groupes.length < 3) return null
    return `${groupes[0]}:${groupes[1]}:${groupes[2]}::`
  }

  return null
}

/**
 * Actions dont la trace est obligatoire, indépendamment de tout réglage.
 *
 * Elles portent une conséquence pour un élève ou un compte. Les autres sont
 * utiles ; celles-ci sont exigibles.
 */
const OBLIGATOIRES: ReadonlySet<ActionAuditee> = new Set([
  'note.modifiee',
  'competence.declaree',
  'apprenant.cree',
  'apprenant.acces_remis',
  'membre.modifie',
  'export.produit',
  'donnees.consultees',
  // Irréversible et invisible une fois faite : sans trace, plus personne ne
  // peut dire qui a effacé cet élève, ni quand la demande a été honorée.
  'apprenant.efface',
  'session.impersonnee',
])

export const estObligatoire = (action: ActionAuditee): boolean => OBLIGATOIRES.has(action)

/** Trois ans pour la sécurité, un an pour le reste (doc 09 §4). */
export const RETENTION_JOURS: Record<'securite' | 'usage', number> = {
  securite: 365 * 3,
  usage: 365,
}

const SECURITE: ReadonlySet<ActionAuditee> = new Set([
  'connexion.reussie',
  'connexion.echouee',
  'connexion.verrouillage',
  'membre.modifie',
  'session.impersonnee',
  'donnees.consultees',
])

export const dureeConservation = (action: ActionAuditee): number =>
  SECURITE.has(action) ? RETENTION_JOURS.securite : RETENTION_JOURS.usage

/**
 * Garde-fou : refuse d'écrire une charge qui ressemble à de la donnée
 * personnelle.
 *
 * Il ne remplace pas la relecture, mais il attrape le cas le plus courant —
 * quelqu'un qui ajoute « pour le débogage » le prénom ou l'e-mail dans la
 * trace, et l'oublie là.
 */
const SUSPECTS = /(prenom|nom|email|mail|adresse|telephone|code|mot_?de_?passe|naissance)/i

export function contientDonneePersonnelle(champs: Readonly<Record<string, unknown>>): boolean {
  return Object.keys(champs).some((cle) => SUSPECTS.test(cle))
}
