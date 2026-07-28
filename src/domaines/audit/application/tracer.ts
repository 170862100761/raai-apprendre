import { randomUUID } from 'node:crypto'
import {
  contientDonneePersonnelle,
  type ActionAuditee,
  type EvenementAudit,
  type TypeSujet,
} from '../domaine/evenement'
import type { JournalAudit } from '../ports/journal'

export type Contexte = {
  readonly sujetId: string | null
  readonly sujetType: TypeSujet
  readonly roleEffectif: string
  readonly etablissementId: string | null
  readonly ip?: string | null
  /** Corrèle une action avec les journaux techniques. */
  readonly idRequete?: string
}

export type Cible = {
  readonly type: string
  readonly id?: string | null
}

/**
 * Trace une action sensible.
 *
 * Signature volontairement pauvre : type de ressource et identifiant, rien
 * d'autre. Il n'existe aucun paramètre où glisser une valeur — pas de
 * « détail », pas de « commentaire ». C'est ce qui empêche le journal de
 * devenir, mois après mois, une seconde base de données personnelles.
 */
export async function tracer(
  action: ActionAuditee,
  contexte: Contexte,
  cible: Cible,
  journal: JournalAudit,
): Promise<void> {
  const evenement: EvenementAudit = {
    sujetId: contexte.sujetId,
    sujetType: contexte.sujetType,
    roleEffectif: contexte.roleEffectif,
    action,
    ressourceType: cible.type,
    ressourceId: cible.id ?? null,
    etablissementId: contexte.etablissementId,
    idRequete: contexte.idRequete ?? randomUUID(),
    ipTronquee: contexte.ip ?? null,
  }

  try {
    await journal.journaliser(evenement)
  } catch (erreur) {
    // La garantie vit ici, pas dans un adaptateur : refuser une connexion
    // parce que le journal est indisponible transformerait une panne
    // d'observabilité en panne de service. On crie côté serveur — c'est un
    // incident — sans faire échouer l'action auditée.
    console.error('[audit] écriture impossible', {
      action,
      erreur: erreur instanceof Error ? erreur.message : String(erreur),
    })
  }
}

/**
 * Garde-fou de développement.
 *
 * Attrape le cas courant — quelqu'un ajoute « pour le débogage » un prénom ou
 * un e-mail dans la trace, et l'oublie là. En production on se contente de le
 * signaler : refuser l'écriture perdrait la trace, ce qui est pire.
 */
export function verifierCharge(champs: Readonly<Record<string, unknown>>): void {
  if (!contientDonneePersonnelle(champs)) return

  const message =
    `[audit] la trace contient un champ qui ressemble à une donnée personnelle : ` +
    Object.keys(champs).join(', ')

  if (process.env.NODE_ENV !== 'production') throw new Error(message)
  console.error(message)
}
