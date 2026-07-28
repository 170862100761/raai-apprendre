/**
 * La boucle complète : passer un quiz, être corrigé, voir sa progression bouger.
 *
 * Exige `npm run bd:locale`, `npm run dev` arrêté.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { identifiant } from '@/noyau/identifiants'
import type {
  IdentifiantApprenant,
  IdentifiantEvaluation,
} from '@/noyau/identifiants'
import {
  demarrerOuReprendre,
  depotEvaluationPrisma,
  soumettre,
} from '@/domaines/evaluation'
import { depotProgressionPrisma, enregistrerResultat } from '@/domaines/progression'

const URL_TEST =
  process.env.DATABASE_URL_TEST ??
  'postgresql://postgres:postgres@127.0.0.1:5433/postgres' +
    '?schema=raai_apprendre&connection_limit=1'

const QUIZ = identifiant<IdentifiantEvaluation>('00000000-0000-4000-8000-000000000220')
const INES = identifiant<IdentifiantApprenant>('00000000-0000-4000-8000-000000000044')
const ETABLISSEMENT = '00000000-0000-4000-8000-000000000003'

let prisma: PrismaClient
let depot: ReturnType<typeof depotEvaluationPrisma>
let progression: ReturnType<typeof depotProgressionPrisma>
let disponible = false

beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: URL_TEST } } })
  try {
    disponible = (await prisma.evaluation.findUnique({ where: { id: QUIZ } })) !== null
  } catch {
    return
  }
  depot = depotEvaluationPrisma(prisma)
  progression = depotProgressionPrisma(prisma)
}, 60_000)

afterAll(async () => {
  if (disponible) {
    await prisma.tentative.deleteMany({ where: { apprenantId: INES } })
    await prisma.acquisCompetence.deleteMany({ where: { apprenantId: INES } })
  }
  await prisma?.$disconnect()
})

/** Identifiants de questions, dans l'ordre du barème semé. */
async function questions() {
  return prisma.question.findMany({
    where: { evaluationId: QUIZ },
    orderBy: { ordre: 'asc' },
    select: { id: true, type: true },
  })
}

describe('énoncé servi à l’élève', () => {
  it("ne contient AUCUN corrigé", async () => {
    if (!disponible) return

    const evaluation = await depot.chargerPourEleve(QUIZ)
    expect(evaluation).not.toBeNull()

    // La garantie tient à la projection : ce qui n'est pas lu ne peut pas fuir.
    const serialise = JSON.stringify(evaluation)
    expect(serialise).not.toContain('bonnes')
    expect(serialise).not.toContain('acceptees')
    expect(serialise).not.toContain('tolerance')
    // Ni la valeur attendue de la question numérique.
    expect(serialise).not.toContain('"valeur":18')
  })

  it('expose les propositions et le barème', async () => {
    if (!disponible) return
    const evaluation = await depot.chargerPourEleve(QUIZ)
    expect(evaluation!.questions).toHaveLength(4)
    expect(evaluation!.questions[0]?.enonce.type).toBe('qcm')
    expect(evaluation!.questions.reduce((t, q) => t + q.bareme, 0)).toBe(9)
  })

  it('rattache le quiz aux compétences des leçons du chapitre', async () => {
    if (!disponible) return
    const evaluation = await depot.chargerPourEleve(QUIZ)
    expect(evaluation!.competences.length).toBeGreaterThan(0)
  })
})

describe('passage et correction', () => {
  it('reprend la tentative en cours au lieu d’en ouvrir une seconde', async () => {
    if (!disponible) return

    // Cas réel : le réseau coupe en zone rurale, l'élève recharge.
    const a = await demarrerOuReprendre(QUIZ, INES, depot)
    const b = await demarrerOuReprendre(QUIZ, INES, depot)

    expect(a.ok && b.ok).toBe(true)
    expect(a.ok && b.ok && a.valeur.tentativeId).toBe(b.ok ? b.valeur.tentativeId : null)
    expect(await prisma.tentative.count({ where: { apprenantId: INES } })).toBe(1)
  })

  it('corrige une copie parfaite', async () => {
    if (!disponible) return

    const qs = await questions()
    const r = await soumettre(
      QUIZ,
      INES,
      {
        reponses: {
          [qs[0]!.id]: { type: 'qcm', choisies: [0] },
          [qs[1]!.id]: { type: 'vrai_faux', valeur: false },
          [qs[2]!.id]: { type: 'numerique', valeur: 18 },
          [qs[3]!.id]: { type: 'texte_court', texte: 'Litres Par Minute' },
        },
      },
      depot,
    )

    expect(r.ok).toBe(true)
    expect(r.ok && r.valeur.score).toBe(9)
    expect(r.ok && r.valeur.scoreMax).toBe(9)
    expect(r.ok && r.valeur.attendUnHumain).toBe(false)
  })

  it('refuse une seconde soumission de la même tentative', async () => {
    if (!disponible) return

    // Le double-clic ne doit ni écraser la copie ni la dupliquer.
    const r = await soumettre(QUIZ, INES, { reponses: {} }, depot)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erreur.code).toBe('conflit')
  })

  it('a bien enregistré les réponses et la note', async () => {
    if (!disponible) return

    const tentative = await prisma.tentative.findFirst({
      where: { apprenantId: INES },
      select: { statut: true, score: true, scoreMax: true, _count: { select: { reponses: true } } },
    })
    expect(tentative?.statut).toBe('corrigee_auto')
    expect(Number(tentative?.score)).toBe(9)
    expect(tentative?._count.reponses).toBe(4)
  })
})

describe('la boucle se referme sur la progression', () => {
  it('fait monter les compétences visées', async () => {
    if (!disponible) return

    const evaluation = await depot.chargerPourEleve(QUIZ)
    const evolutions = await enregistrerResultat(
      {
        apprenantId: INES,
        etablissementId: ETABLISSEMENT,
        competences: evaluation!.competences,
        score: 9,
        scoreMax: 9,
        sourceId: QUIZ,
        survenuLe: new Date(),
      },
      progression,
    )

    expect(evolutions.length).toBeGreaterThan(0)
    expect(evolutions.every((e) => e.niveau === 'acquise')).toBe(true)

    const acquis = await prisma.acquisCompetence.findMany({ where: { apprenantId: INES } })
    expect(acquis.length).toBe(evolutions.length)
    expect(acquis.every((a) => a.niveau === 'acquise')).toBe(true)
  })

  it("un mauvais résultat ne dégrade pas ce qui est acquis", async () => {
    if (!disponible) return

    const evaluation = await depot.chargerPourEleve(QUIZ)
    const evolutions = await enregistrerResultat(
      {
        apprenantId: INES,
        etablissementId: ETABLISSEMENT,
        competences: evaluation!.competences,
        score: 1,
        scoreMax: 9,
        sourceId: QUIZ,
        survenuLe: new Date(),
      },
      progression,
    )

    // La règle qui rend le suivi non anxiogène — vérifiée jusqu'en base, pas
    // seulement dans le domaine.
    expect(evolutions.every((e) => e.modifie === false)).toBe(true)

    const acquis = await prisma.acquisCompetence.findMany({ where: { apprenantId: INES } })
    expect(acquis.every((a) => a.niveau === 'acquise')).toBe(true)
  })

  it('un acquis dit toujours d’où il vient', async () => {
    if (!disponible) return
    const acquis = await prisma.acquisCompetence.findFirst({ where: { apprenantId: INES } })
    expect(acquis?.origine).toBe('evaluation')
    expect(acquis?.sourceId).toBe(QUIZ)
  })
})
