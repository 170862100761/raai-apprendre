import type { PrismaClient } from '@prisma/client'
import { identifiant } from '@/noyau/identifiants'
import type {
  IdentifiantApprenant,
  IdentifiantCompetence,
  IdentifiantLecon,
} from '@/noyau/identifiants'
import { lireContenu, type Bloc } from '../domaine/bloc'
import type { LeconDuParcours, StatutLecon } from '../domaine/lecon'
import type {
  Chapitre,
  CompetenceOption,
  DepotCatalogue,
  LeconEditable,
  LeconPubliee,
} from '../ports/depot-catalogue'

export function depotCataloguePrisma(prisma: PrismaClient): DepotCatalogue {
  return {
    async chargerLecon(id): Promise<LeconPubliee | null> {
      const lecon = await prisma.lecon.findUnique({
        where: { id },
        select: {
          id: true,
          titre: true,
          statut: true,
          version: true,
          dureeEstimeeMin: true,
          blocs: { orderBy: { ordre: 'asc' } },
          liens: { select: { competenceId: true } },
          chapitre: {
            select: { titre: true, module: { select: { matiere: { select: { intitule: true } } } } },
          },
        },
      })
      if (!lecon) return null

      return {
        id: identifiant<IdentifiantLecon>(lecon.id),
        titre: lecon.titre,
        statut: lecon.statut as StatutLecon,
        version: lecon.version,
        dureeEstimeeMin: lecon.dureeEstimeeMin,
        blocs: lecon.blocs.flatMap(convertirBloc),
        competences: lecon.liens.map((l) => identifiant<IdentifiantCompetence>(l.competenceId)),
        chapitre: lecon.chapitre.titre,
        matiere: lecon.chapitre.module.matiere.intitule,
      }
    },

    async leconsDeLaClasse(classeId) {
      const classe = await prisma.classe.findUnique({
        where: { id: classeId },
        select: { etablissementId: true },
      })
      if (!classe) return []

      return lireLecons(prisma, classe.etablissementId, null)
    },

    async parcoursDeLApprenant(apprenantId) {
      const apprenant = await prisma.apprenant.findUnique({
        where: { id: apprenantId },
        select: { etablissementId: true },
      })
      if (!apprenant) return []

      return lireLecons(prisma, apprenant.etablissementId, apprenantId)
    },

    async publier(id, dureeEstimeeMin, version) {
      await prisma.lecon.update({
        where: { id },
        data: { statut: 'publiee', dureeEstimeeMin, version, publieeLe: new Date() },
      })
    },

    async depublier(id, version) {
      await prisma.lecon.update({
        where: { id },
        data: { statut: 'brouillon', version, publieeLe: null },
      })
    },

    async creerLecon({ chapitreId, etablissementId, titre, competences }) {
      const lecon = await prisma.lecon.create({
        data: {
          chapitreId,
          etablissementId,
          titre,
          statut: 'brouillon',
          liens: { create: competences.map((competenceId) => ({ competenceId })) },
        },
        select: { id: true },
      })
      return identifiant<IdentifiantLecon>(lecon.id)
    },

    async remplacerBlocs(leconId, blocs) {
      // Remplacement complet dans une transaction : un enregistrement
      // interrompu ne doit pas laisser une leçon amputée de la moitié de ses
      // blocs.
      await prisma.$transaction([
        prisma.blocContenu.deleteMany({ where: { leconId } }),
        prisma.blocContenu.createMany({
          data: blocs.map((bloc, i) => ({
            leconId,
            type: bloc.contenu.type,
            contenu: bloc.contenu,
            ordre: i + 1,
            genereParIa: bloc.genereParIa,
          })),
        }),
      ])
    },

    async remplacerCompetences(leconId, competences) {
      await prisma.$transaction([
        prisma.lienCompetence.deleteMany({ where: { leconId } }),
        prisma.lienCompetence.createMany({
          data: competences.map((competenceId) => ({ leconId, competenceId })),
        }),
      ])
    },

    async modifierTitre(leconId, titre) {
      await prisma.lecon.update({ where: { id: leconId }, data: { titre } })
    },

    async leconsDeLEtablissement(etablissementId): Promise<readonly LeconEditable[]> {
      const lecons = await prisma.lecon.findMany({
        where: { etablissementId },
        orderBy: [{ statut: 'asc' }, { creeLe: 'desc' }],
        select: {
          id: true,
          titre: true,
          statut: true,
          chapitre: { select: { titre: true } },
          _count: { select: { blocs: true, liens: true } },
        },
      })

      return lecons.map((l) => ({
        id: identifiant<IdentifiantLecon>(l.id),
        titre: l.titre,
        statut: l.statut,
        chapitre: l.chapitre.titre,
        nombreBlocs: l._count.blocs,
        nombreCompetences: l._count.liens,
      }))
    },

    async chapitresDisponibles(etablissementId): Promise<readonly Chapitre[]> {
      const chapitres = await prisma.chapitre.findMany({
        where: { module: { matiere: { etablissementId } } },
        orderBy: [{ module: { ordre: 'asc' } }, { ordre: 'asc' }],
        select: {
          id: true,
          titre: true,
          module: { select: { matiere: { select: { intitule: true } } } },
        },
      })

      return chapitres.map((c) => ({
        id: c.id,
        titre: c.titre,
        matiere: c.module.matiere.intitule,
      }))
    },

    async competencesDuDiplome(etablissementId): Promise<readonly CompetenceOption[]> {
      // Les compétences des diplômes que l'établissement a ouverts, dans la
      // version en vigueur. Proposer tout le catalogue national noierait
      // l'enseignant sous des référentiels qui ne le concernent pas.
      const competences = await prisma.competence.findMany({
        where: {
          version: {
            statut: 'publie',
            diplome: { offres: { some: { etablissementId } } },
          },
        },
        orderBy: { ordre: 'asc' },
        select: { id: true, code: true, intitule: true },
      })

      return competences.map((c) => ({
        id: identifiant<IdentifiantCompetence>(c.id),
        code: c.code,
        intitule: c.intitule,
      }))
    },
  }
}

/**
 * Un bloc dont le contenu ne se valide pas est ÉCARTÉ, pas rendu.
 *
 * Le JSONB peut contenir n'importe quoi — import raté, écriture manuelle,
 * ancienne version d'un type de bloc. Rendre au jugé reviendrait à faire
 * confiance à la base pour ce qui s'affichera chez un élève.
 */
function convertirBloc(ligne: {
  id: string
  ordre: number
  contenu: unknown
  genereParIa: boolean
}): Bloc[] {
  const contenu = lireContenu(ligne.contenu)
  if (!contenu) return []

  return [{ id: ligne.id, ordre: ligne.ordre, contenu, genereParIa: ligne.genereParIa }]
}

async function lireLecons(
  prisma: PrismaClient,
  etablissementId: string,
  apprenantId: string | null,
): Promise<readonly LeconDuParcours[]> {
  const lecons = await prisma.lecon.findMany({
    where: { etablissementId, statut: 'publiee' },
    select: {
      id: true,
      titre: true,
      dureeEstimeeMin: true,
      chapitre: {
        select: { titre: true, ordre: true, module: { select: { ordre: true } } },
      },
      ...(apprenantId
        ? {
            lectures: {
              where: { apprenantId },
              select: { termineeLe: true },
            },
          }
        : {}),
    },
  })

  return lecons
    .map((l) => {
      const lectures = 'lectures' in l ? (l.lectures as { termineeLe: Date | null }[]) : []
      const lecture = lectures[0]

      return {
        id: identifiant<IdentifiantLecon>(l.id),
        titre: l.titre,
        dureeEstimeeMin: l.dureeEstimeeMin,
        // L'ordre du programme : module, puis chapitre. Deux chapitres du même
        // module gardent leur ordre relatif.
        ordre: l.chapitre.module.ordre * 1000 + l.chapitre.ordre,
        chapitre: l.chapitre.titre,
        commencee: lecture !== undefined,
        terminee: lecture?.termineeLe != null,
      }
    })
    .sort((a, b) => a.ordre - b.ordre)
}

/** Marque l'ouverture d'une leçon, et la position de reprise. */
export async function enregistrerLecture(
  prisma: PrismaClient,
  apprenantId: IdentifiantApprenant,
  leconId: IdentifiantLecon,
  etablissementId: string,
  position: number,
  terminee: boolean,
): Promise<void> {
  const existante = await prisma.lectureLecon.findUnique({
    where: { apprenantId_leconId: { apprenantId, leconId } },
    select: { position: true, termineeLe: true },
  })

  // La position ne recule jamais : rouvrir le début d'un cours déjà lu ne doit
  // pas effacer l'avancement. Et une leçon terminée le reste — la relire n'est
  // pas la « dé-terminer ».
  const avancement = Math.max(position, existante?.position ?? 0)
  const termineeLe = existante?.termineeLe ?? (terminee ? new Date() : null)

  await prisma.lectureLecon.upsert({
    where: { apprenantId_leconId: { apprenantId, leconId } },
    create: {
      apprenantId,
      leconId,
      etablissementId,
      position: avancement,
      ...(termineeLe ? { termineeLe } : {}),
    },
    update: {
      position: avancement,
      ...(termineeLe ? { termineeLe } : {}),
    },
  })
}
