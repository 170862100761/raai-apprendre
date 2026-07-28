import type { PrismaClient } from '@prisma/client'
import { identifiant } from '@/noyau/identifiants'
import type {
  IdentifiantApprenant,
  IdentifiantCompetence,
} from '@/noyau/identifiants'
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

    async lireGrilleClasse(classeId) {
      const classe = await prisma.classe.findUnique({
        where: { id: classeId },
        select: {
          nom: true,
          etablissementId: true,
          offre: { select: { diplomeId: true } },
          inscriptions: {
            where: { statut: 'active' },
            select: {
              apprenant: {
                select: { id: true, prenom: true, initialeNom: true, vuLe: true, actif: true },
              },
            },
          },
        },
      })
      if (!classe) return null

      // Les compétences du diplôme de la classe, version en vigueur — pas tout
      // le catalogue national : une grille de 200 colonnes ne se lit pas.
      const competences = await prisma.competence.findMany({
        where: {
          version: { statut: 'publie', diplomeId: classe.offre.diplomeId },
          // Seules les capacités de rang 1 : c'est le niveau auquel un
          // enseignant raisonne et auquel le référentiel définit les blocs.
          parentId: null,
        },
        orderBy: { ordre: 'asc' },
        select: { id: true, code: true, intitule: true },
      })

      const apprenants = classe.inscriptions
        .map((i) => i.apprenant)
        .filter((a) => a.actif)
        .sort((a, b) => a.prenom.localeCompare(b.prenom, 'fr'))

      const acquis = await prisma.acquisCompetence.findMany({
        where: {
          apprenantId: { in: apprenants.map((a) => a.id) },
          competenceId: { in: competences.map((c) => c.id) },
        },
        select: { apprenantId: true, competenceId: true, niveau: true },
      })

      return {
        nomClasse: classe.nom,
        etablissementId: classe.etablissementId,
        apprenants: apprenants.map((a) => ({
          id: identifiant<IdentifiantApprenant>(a.id),
          prenom: a.prenom,
          initialeNom: a.initialeNom,
          vuLe: a.vuLe,
        })),
        competences: competences.map((c) => ({
          id: identifiant<IdentifiantCompetence>(c.id),
          code: c.code,
          intitule: c.intitule,
        })),
        cellules: acquis.map((a) => ({
          apprenantId: identifiant<IdentifiantApprenant>(a.apprenantId),
          competenceId: identifiant<IdentifiantCompetence>(a.competenceId),
          niveau: a.niveau as NiveauAcquisition,
        })),
      }
    },
  }
}
