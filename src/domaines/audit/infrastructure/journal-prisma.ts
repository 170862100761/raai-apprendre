import type { PrismaClient } from '@prisma/client'
import { tronquerIp, type ActionAuditee } from '../domaine/evenement'
import type { JournalAudit, LectureJournal } from '../ports/journal'

/**
 * Écriture par la fonction `SECURITY DEFINER`, jamais par un INSERT direct.
 *
 * Le schéma d'audit est fermé : même le propriétaire des tables ne peut pas y
 * écrire, puisque la RLS y est forcée. Passer par la fonction est la seule
 * voie, et c'est ce qui garantit qu'on n'y déversera pas autre chose que des
 * métadonnées.
 */
export function journalPrisma(prisma: PrismaClient): JournalAudit {
  return {
    async journaliser(evenement) {
      await prisma.$executeRaw`
          SELECT raai_apprendre_audit.journaliser(
            ${evenement.sujetId}::uuid,
            ${evenement.sujetType},
            ${evenement.roleEffectif},
            ${evenement.action},
            ${evenement.ressourceType},
            ${evenement.ressourceId}::uuid,
            ${evenement.etablissementId}::uuid,
            ${evenement.idRequete},
            ${tronquerIp(evenement.ipTronquee)}
          )`
    },
  }
}

/**
 * Lecture par `lire_journal`, jamais par un SELECT direct.
 *
 * Le schéma d'audit est fermé à tous les rôles (`REVOKE ALL ON SCHEMA`) : un
 * SELECT y échoue avant même que la RLS ait à trancher. La fonction porte donc
 * seule le contrôle d'accès — elle exige `admin_etablissement` et l'appartenance
 * à l'établissement consulté. La vérification faite côté application est un
 * confort d'interface, pas la barrière.
 */
export function lectureJournalPrisma(prisma: PrismaClient): LectureJournal {
  return {
    async lire(etablissementId, limite) {
      const lignes = await prisma.$queryRaw<
        { action: string; ressource_type: string; role_effectif: string; survenu_le: Date }[]
      >`SELECT * FROM raai_apprendre_audit.lire_journal(${etablissementId}::uuid, ${limite}::integer)`

      return lignes.map((l) => ({
        action: l.action as ActionAuditee,
        ressourceType: l.ressource_type,
        roleEffectif: l.role_effectif,
        survenuLe: l.survenu_le,
      }))
    },
  }
}

/** Journal muet, pour les tests et les contextes sans base. */
export const journalMuet: JournalAudit = {
  async journaliser() {},
}
