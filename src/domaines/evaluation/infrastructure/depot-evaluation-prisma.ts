import type { PrismaClient } from '@prisma/client'
import { identifiant } from '@/noyau/identifiants'
import type {
  IdentifiantApprenant,
  IdentifiantCompetence,
  IdentifiantEvaluation,
  IdentifiantTentative,
} from '@/noyau/identifiants'
import type { Echeance, TypeEvaluation } from '../domaine/echeance'
import { lireCorrige, lireEnonce } from '../domaine/question'
import type { StatutTentative } from '../domaine/tentative'
import type {
  DepotEvaluation,
  EvaluationPourEleve,
  QuestionAvecCorrige,
  QuestionPourEleve,
  TentativeStockee,
} from '../ports/depot-evaluation'

export function depotEvaluationPrisma(prisma: PrismaClient): DepotEvaluation {
  return {
    async chargerPourEleve(id): Promise<EvaluationPourEleve | null> {
      const evaluation = await prisma.evaluation.findFirst({
        where: { id, statut: 'publiee' },
        select: {
          id: true,
          titre: true,
          type: true,
          dureeMaxMin: true,
          etablissementId: true,
          // `corrige` est délibérément absent de cette projection : ce qui
          // n'est pas lu ne peut pas fuir.
          questions: {
            orderBy: { ordre: 'asc' },
            select: { id: true, type: true, enonce: true, options: true, bareme: true, ordre: true },
          },
          chapitre: {
            select: { lecons: { select: { liens: { select: { competenceId: true } } } } },
          },
        },
      })
      if (!evaluation) return null

      const questions: QuestionPourEleve[] = evaluation.questions.flatMap((q) => {
        const enonce = lireEnonce({ type: q.type, ...(q.options as object) })
        if (!enonce) return []
        return [
          {
            id: q.id,
            intitule: q.enonce,
            enonce,
            bareme: Number(q.bareme),
            ordre: q.ordre,
          },
        ]
      })

      // Les compétences visées sont celles des leçons du même chapitre : un
      // enseignant ne rattache pas deux fois la même chose.
      const competences = [
        ...new Set(
          evaluation.chapitre.lecons.flatMap((l) => l.liens.map((lien) => lien.competenceId)),
        ),
      ].map((c) => identifiant<IdentifiantCompetence>(c))

      return {
        id: identifiant<IdentifiantEvaluation>(evaluation.id),
        titre: evaluation.titre,
        type: evaluation.type,
        dureeMaxMin: evaluation.dureeMaxMin,
        questions,
        competences,
        etablissementId: evaluation.etablissementId,
      }
    },

    async chargerCorriges(id): Promise<readonly QuestionAvecCorrige[]> {
      const questions = await prisma.question.findMany({
        where: { evaluationId: id },
        select: { id: true, type: true, corrige: true, bareme: true },
      })

      return questions.flatMap((q) => {
        const corrige = lireCorrige({ type: q.type, ...(q.corrige as object) })
        if (!corrige) return []
        return [{ id: q.id, corrige, bareme: Number(q.bareme) }]
      })
    },

    async tentativeEnCours(evaluationId, apprenantId): Promise<TentativeStockee | null> {
      const tentative = await prisma.tentative.findFirst({
        where: { evaluationId, apprenantId, statut: 'en_cours' },
        orderBy: { creeLe: 'desc' },
        select: { id: true, evaluationId: true, apprenantId: true, statut: true, creeLe: true },
      })
      return tentative ? convertir(tentative) : null
    },

    async demarrerTentative({ evaluationId, apprenantId, etablissementId }) {
      const tentative = await prisma.tentative.create({
        data: { evaluationId, apprenantId, etablissementId, statut: 'en_cours' },
        select: { id: true, evaluationId: true, apprenantId: true, statut: true, creeLe: true },
      })
      return convertir(tentative)
    },

    async enregistrerCorrection(entree) {
      // Transaction : une copie à moitié enregistrée est une copie perdue, et
      // l'élève n'a aucun moyen de s'en apercevoir.
      await prisma.$transaction([
        prisma.reponse.deleteMany({ where: { tentativeId: entree.tentativeId } }),
        prisma.reponse.createMany({
          data: entree.reponses.map((r) => ({
            tentativeId: entree.tentativeId,
            questionId: r.questionId,
            valeur: r.valeur,
            score: r.score,
          })),
        }),
        prisma.tentative.update({
          where: { id: entree.tentativeId },
          data: {
            statut: entree.statut,
            score: entree.score,
            scoreMax: entree.scoreMax,
            dureeSecondes: entree.dureeSecondes,
            soumiseLe: new Date(),
          },
        }),
      ])
    },

    async echeancesDeLApprenant(apprenantId, borneHaute): Promise<readonly Echeance[]> {
      const apprenant = await prisma.apprenant.findUnique({
        where: { id: apprenantId },
        select: { etablissementId: true },
      })
      if (!apprenant) return []

      const evaluations = await prisma.evaluation.findMany({
        where: {
          etablissementId: apprenant.etablissementId,
          statut: 'publiee',
          // `not: null` et la borne haute ensemble : l'index
          // (etablissement_id, echeance_le) ne sert que si la colonne est
          // contrainte, pas seulement lue.
          echeanceLe: { not: null, lte: borneHaute },
        },
        orderBy: { echeanceLe: 'asc' },
        select: {
          id: true,
          titre: true,
          type: true,
          echeanceLe: true,
          chapitre: { select: { titre: true } },
          // Une seule ligne suffit à répondre « rendue ? ». Charger toutes les
          // tentatives pour n'en tester que l'existence coûterait sans rien
          // apprendre de plus.
          tentatives: {
            where: { apprenantId, statut: { not: 'en_cours' } },
            select: { id: true },
            take: 1,
          },
        },
      })

      return evaluations.flatMap((e) =>
        // Le filtre garantit déjà la date ; ce test-ci est là pour le typage,
        // Prisma ne sachant pas restreindre `Date | null` par le `where`.
        e.echeanceLe === null
          ? []
          : [
              {
                evaluationId: identifiant<IdentifiantEvaluation>(e.id),
                titre: e.titre,
                type: e.type as TypeEvaluation,
                chapitre: e.chapitre.titre,
                echeanceLe: e.echeanceLe,
                rendue: e.tentatives.length > 0,
              },
            ],
      )
    },

    async derniereTentative(evaluationId, apprenantId) {
      const tentative = await prisma.tentative.findFirst({
        where: { evaluationId, apprenantId, statut: { not: 'en_cours' } },
        orderBy: { creeLe: 'desc' },
        select: {
          id: true,
          evaluationId: true,
          apprenantId: true,
          statut: true,
          creeLe: true,
          score: true,
          scoreMax: true,
        },
      })
      if (!tentative) return null

      return {
        ...convertir(tentative),
        score: tentative.score === null ? null : Number(tentative.score),
        scoreMax: tentative.scoreMax === null ? null : Number(tentative.scoreMax),
      }
    },
  }
}

function convertir(ligne: {
  id: string
  evaluationId: string
  apprenantId: string
  statut: string
  creeLe: Date
}): TentativeStockee {
  return {
    id: identifiant<IdentifiantTentative>(ligne.id),
    evaluationId: identifiant<IdentifiantEvaluation>(ligne.evaluationId),
    apprenantId: identifiant<IdentifiantApprenant>(ligne.apprenantId),
    statut: ligne.statut as StatutTentative,
    creeLe: ligne.creeLe,
  }
}
