import type { PrismaClient } from '@prisma/client'
import { identifiant } from '@/noyau/identifiants'
import type {
  IdentifiantApprenant,
  IdentifiantCompetence,
  IdentifiantEvaluation,
  IdentifiantTentative,
} from '@/noyau/identifiants'
import type { Echeance, TypeEvaluation } from '../domaine/echeance'
import { lireCorrige, lireEnonce, lireReponse } from '../domaine/question'
import type { StatutTentative } from '../domaine/tentative'
import type {
  CopieEnAttente,
  CopiePourCorrection,
  DepotEvaluation,
  EvaluationPourEleve,
  QuestionAvecCorrige,
  QuestionCorrigeable,
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
        select: { id: true, type: true, corrige: true, bareme: true, explication: true },
      })

      return questions.flatMap((q) => {
        const corrige = lireCorrige({ type: q.type, ...(q.corrige as object) })
        if (!corrige) return []
        return [{ id: q.id, corrige, bareme: Number(q.bareme), explication: q.explication }]
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

    async copiesEnAttente(etablissementId): Promise<readonly CopieEnAttente[]> {
      const tentatives = await prisma.tentative.findMany({
        where: { etablissementId, statut: 'attente_correction' },
        // La plus ancienne d'abord : une copie qui attend depuis trois semaines
        // passe devant celle rendue ce matin, sinon la pile ne se vide jamais
        // par le bas.
        orderBy: { soumiseLe: 'asc' },
        select: {
          id: true,
          apprenantId: true,
          soumiseLe: true,
          apprenant: { select: { prenom: true, initialeNom: true } },
          evaluation: { select: { titre: true, chapitre: { select: { titre: true } } } },
          reponses: { where: { score: null }, select: { id: true } },
        },
      })

      return tentatives.map((t) => ({
        tentativeId: identifiant<IdentifiantTentative>(t.id),
        apprenantId: identifiant<IdentifiantApprenant>(t.apprenantId),
        prenom: t.apprenant.prenom,
        initialeNom: t.apprenant.initialeNom,
        evaluationTitre: t.evaluation.titre,
        chapitre: t.evaluation.chapitre.titre,
        soumiseLe: t.soumiseLe,
        aNoter: t.reponses.length,
      }))
    },

    async chargerPourCorrection(id): Promise<CopiePourCorrection | null> {
      const tentative = await prisma.tentative.findUnique({
        where: { id },
        select: {
          id: true,
          statut: true,
          apprenantId: true,
          etablissementId: true,
          evaluationId: true,
          apprenant: { select: { prenom: true, initialeNom: true } },
          evaluation: {
            select: {
              titre: true,
              questions: {
                orderBy: { ordre: 'asc' },
                select: {
                  id: true,
                  type: true,
                  enonce: true,
                  bareme: true,
                  corrige: true,
                },
              },
            },
          },
          reponses: {
            select: { questionId: true, valeur: true, score: true, commentaire: true },
          },
        },
      })
      if (!tentative) return null

      const parQuestion = new Map(tentative.reponses.map((r) => [r.questionId, r]))

      const questions: QuestionCorrigeable[] = tentative.evaluation.questions.map((q) => {
        const reponse = parQuestion.get(q.id)
        return {
          questionId: q.id,
          intitule: q.enonce,
          type: q.type,
          bareme: Number(q.bareme),
          score: reponse?.score === null || reponse?.score === undefined
            ? null
            : Number(reponse.score),
          commentaire: reponse?.commentaire ?? '',
          reponse: reponse ? lireReponse({ type: q.type, ...(reponse.valeur as object) }) : null,
          corrige: lireCorrige({ type: q.type, ...(q.corrige as object) }),
        }
      })

      return {
        copie: {
          tentativeId: identifiant<IdentifiantTentative>(tentative.id),
          statut: tentative.statut as StatutTentative,
          questions: questions.map((q) => ({
            questionId: q.questionId,
            bareme: q.bareme,
            score: q.score,
          })),
        },
        apprenantId: identifiant<IdentifiantApprenant>(tentative.apprenantId),
        prenom: tentative.apprenant.prenom,
        initialeNom: tentative.apprenant.initialeNom,
        evaluationId: identifiant<IdentifiantEvaluation>(tentative.evaluationId),
        evaluationTitre: tentative.evaluation.titre,
        etablissementId: tentative.etablissementId,
        questions,
      }
    },

    async enregistrerNotes({ tentativeId, statut, score, scoreMax, notes }) {
      // Transaction : une copie dont les notes sont écrites mais dont le statut
      // reste « en attente » repartirait dans la pile, et l'enseignant la
      // corrigerait deux fois.
      await prisma.$transaction([
        ...notes.map((note) =>
          prisma.reponse.update({
            where: {
              tentativeId_questionId: { tentativeId, questionId: note.questionId },
            },
            data: { score: note.score, commentaire: note.commentaire },
          }),
        ),
        prisma.tentative.update({
          where: { id: tentativeId },
          data: { statut, score, scoreMax },
        }),
      ])
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

    // --- Édition (enseignant) ----------------------------------------------

    async evaluationsDeLEtablissement(etablissementId) {
      const lignes = await prisma.evaluation.findMany({
        where: { etablissementId },
        orderBy: [{ statut: 'asc' }, { creeLe: 'desc' }],
        select: {
          id: true,
          titre: true,
          type: true,
          statut: true,
          chapitre: { select: { titre: true } },
          _count: { select: { questions: true } },
        },
      })
      return lignes.map((l) => ({
        id: identifiant<IdentifiantEvaluation>(l.id),
        titre: l.titre,
        type: l.type,
        statut: l.statut,
        chapitre: l.chapitre.titre,
        nombreQuestions: l._count.questions,
      }))
    },

    async chargerPourEdition(id, etablissementId) {
      const evaluation = await prisma.evaluation.findFirst({
        where: { id, etablissementId },
        select: {
          id: true,
          titre: true,
          type: true,
          statut: true,
          chapitre: { select: { titre: true } },
          questions: {
            orderBy: { ordre: 'asc' },
            select: { enonce: true, type: true, options: true, corrige: true, bareme: true },
          },
        },
      })
      if (!evaluation) return null

      return {
        id: identifiant<IdentifiantEvaluation>(evaluation.id),
        titre: evaluation.titre,
        type: evaluation.type,
        statut: evaluation.statut,
        chapitre: evaluation.chapitre.titre,
        // Une question au contenu illisible est écartée de l'édition plutôt
        // que de faire tomber l'écran — même règle que côté élève.
        questions: evaluation.questions.flatMap((q) => {
          const enonce = lireEnonce({ type: q.type, ...(q.options as object) })
          const corrige = lireCorrige({ type: q.type, ...(q.corrige as object) })
          if (!enonce || !corrige) return []
          return [{ intitule: q.enonce, enonce, corrige, bareme: Number(q.bareme) }]
        }),
      }
    },

    async creerEvaluation(entree) {
      const evaluation = await prisma.evaluation.create({
        data: {
          chapitreId: entree.chapitreId,
          etablissementId: entree.etablissementId,
          titre: entree.titre,
          type: entree.type as 'quiz',
          statut: 'brouillon',
        },
        select: { id: true },
      })
      return identifiant<IdentifiantEvaluation>(evaluation.id)
    },

    async modifierEvaluation(id, etablissementId, titre) {
      await prisma.evaluation.updateMany({ where: { id, etablissementId }, data: { titre } })
    },

    async remplacerQuestions(id, etablissementId, questions) {
      // Le filtre d'établissement sur la suppression : sans lui, un identifiant
      // deviné suffirait à vider le quiz d'un autre établissement.
      const possedee = await prisma.evaluation.findFirst({
        where: { id, etablissementId },
        select: { id: true },
      })
      if (!possedee) return

      await prisma.$transaction([
        prisma.question.deleteMany({ where: { evaluationId: id } }),
        prisma.question.createMany({
          data: questions.map((q, rang) => {
            const { type, ...options } = q.enonce
            const { type: _, ...corrige } = q.corrige
            return {
              evaluationId: id,
              type,
              enonce: q.intitule,
              options,
              corrige,
              bareme: q.bareme,
              ordre: rang + 1,
            }
          }),
        }),
      ])
    },

    async changerStatutEvaluation(id, etablissementId, statut) {
      await prisma.evaluation.updateMany({ where: { id, etablissementId }, data: { statut } })
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
