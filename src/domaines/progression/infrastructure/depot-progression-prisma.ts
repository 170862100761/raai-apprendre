import type { PrismaClient } from '@prisma/client'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantCompetence } from '@/noyau/identifiants'
import type { AcquisExistant, NiveauAcquisition } from '../domaine/acquisition'
import type { DepotProgression } from '../ports/depot-progression'

export function depotProgressionPrisma(prisma: PrismaClient): DepotProgression {
  return {
    async lireAcquis(apprenantId, competences) {
      const lignes = await prisma.acquisCompetence.findMany({
        where: { apprenantId, competenceId: { in: [...competences] } },
        select: { competenceId: true, niveau: true, constateLe: true },
      })

      return new Map(
        lignes.map((l) => [
          identifiant<IdentifiantCompetence>(l.competenceId),
          { niveau: l.niveau as NiveauAcquisition, constateLe: l.constateLe } as AcquisExistant,
        ]),
      )
    },

    async ecrireAcquis(ecritures) {
      if (ecritures.length === 0) return

      // La version de référentiel en vigueur pour chaque compétence : le
      // domaine n'a pas à la connaître, mais un acquis doit rester lisible
      // après une réforme d'arrêté.
      const versions = await prisma.competence.findMany({
        where: { id: { in: ecritures.map((e) => e.competenceId) } },
        select: { id: true, versionId: true },
      })
      const versionDe = new Map(versions.map((v) => [v.id, v.versionId]))

      await prisma.$transaction(
        ecritures.flatMap((e) => {
          const versionId = versionDe.get(e.competenceId)
          if (!versionId) return []

          return [
            prisma.acquisCompetence.upsert({
              where: {
                apprenantId_competenceId_versionReferentielId: {
                  apprenantId: e.apprenantId,
                  competenceId: e.competenceId,
                  versionReferentielId: versionId,
                },
              },
              create: {
                apprenantId: e.apprenantId,
                competenceId: e.competenceId,
                versionReferentielId: versionId,
                etablissementId: e.etablissementId,
                niveau: e.niveau,
                score: e.score,
                origine: e.origine,
                sourceId: e.sourceId,
                constateLe: e.constateLe,
              },
              update: {
                niveau: e.niveau,
                score: e.score,
                origine: e.origine,
                sourceId: e.sourceId,
                constateLe: e.constateLe,
              },
            }),
          ]
        }),
      )
    },
  }
}
