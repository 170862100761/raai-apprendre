import type { PrismaClient } from '@prisma/client'
import { tronquerIp } from '../domaine/evenement'
import type { JournalAudit } from '../ports/journal'

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

/** Journal muet, pour les tests et les contextes sans base. */
export const journalMuet: JournalAudit = {
  async journaliser() {},
}
