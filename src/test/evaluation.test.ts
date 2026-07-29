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
  IdentifiantTentative,
} from '@/noyau/identifiants'
import {
  chargerEcheances,
  demarrerOuReprendre,
  depotEvaluationPrisma,
  listerCopiesEnAttente,
  noterCopie,
  soumettre,
} from '@/domaines/evaluation'
import { depotProgressionPrisma, enregistrerResultat } from '@/domaines/progression'

const URL_TEST =
  process.env.DATABASE_URL_TEST ??
  'postgresql://postgres:postgres@127.0.0.1:5433/postgres' +
    '?schema=raai_apprendre&connection_limit=1&pgbouncer=true'

const QUIZ = identifiant<IdentifiantEvaluation>('00000000-0000-4000-8000-000000000220')
const DEVOIR_EN_RETARD = identifiant<IdentifiantEvaluation>('00000000-0000-4000-8000-000000000240')
const ENTRAINEMENT = identifiant<IdentifiantEvaluation>('00000000-0000-4000-8000-000000000242')
// Les identifiants d'élèves ne sont PAS 40, 41, 42 : le semoir consomme la même
// suite pour les inscriptions et les acquis. Léa est 40, Thomas 47, Inès 54.
// L'ancienne valeur (44) désignait une ligne d'acquis de Léa, donc aucun élève —
// et les tests passaient quand même, faute de tomber en panne bruyamment.
const INES = identifiant<IdentifiantApprenant>('00000000-0000-4000-8000-000000000054')
/** Léa a rendu le devoir en retard, Inès non — le jeu de démonstration le pose. */
const LEA = identifiant<IdentifiantApprenant>('00000000-0000-4000-8000-000000000040')
const ETABLISSEMENT = '00000000-0000-4000-8000-000000000003'
/** La question rédigée du devoir : celle qui crée la pile de correction. */
const QUESTION_REDIGEE = '00000000-0000-4000-8000-000000000244'
/** Élève et copie créés pour ce fichier, et détruits avec lui. */
const COBAYE = '00000000-0000-4000-8000-0000000009e0'
const COPIE_DU_COBAYE = identifiant<IdentifiantTentative>(
  '00000000-0000-4000-8000-0000000009e1',
)

let prisma: PrismaClient
let depot: ReturnType<typeof depotEvaluationPrisma>
let progression: ReturnType<typeof depotProgressionPrisma>
let disponible = false

beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: URL_TEST } } })

  // Deux situations que l'ancien `catch` confondait, au prix de tests qui ne
  // testaient plus rien : base absente — on s'abstient, c'est légitime — et
  // base présente mais jeu de démonstration incomplet, qui est un échec.
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    return
  }

  if ((await prisma.evaluation.findUnique({ where: { id: QUIZ } })) === null) {
    throw new Error(
      'Base joignable mais jeu de démonstration absent. Relancer `npm run bd:locale`.',
    )
  }

  disponible = true
  depot = depotEvaluationPrisma(prisma)
  progression = depotProgressionPrisma(prisma)

  // Le test se donne sa propre copie plutôt que d'emprunter celle de Thomas.
  //
  // Première version : on corrigeait la copie semée et on la restaurait. Deux
  // ennuis, tous deux payés. D'abord la restauration devait tomber juste à
  // chaque fois, sinon le passage suivant trouvait une copie déjà corrigée.
  // Ensuite, enchaîner plusieurs écritures dans un même `beforeAll` casse le
  // socket PGlite (« unexpected message from server ») — et vitest compte
  // alors les tests du fichier comme « skipped », sans les faire figurer dans
  // le total des échecs. Dix-neuf tests disparaissaient sans un rouge.
  //
  // Un fixture qui n'appartient qu'à ce fichier supprime les deux problèmes :
  // rien à restaurer, et rien que les autres fichiers puissent constater.
  // Tout en une transaction, donc un seul aller-retour : c'est l'enchaînement
  // d'écritures séparées qui met le socket par terre.
  await prisma.$transaction([
    // Les tentatives d'Inès sont créées par les tests de passage plus bas et
    // s'accumuleraient sinon d'une exécution à l'autre — « expected 6 to be 1 ».
    prisma.tentative.deleteMany({ where: { apprenantId: INES } }),
    prisma.acquisCompetence.deleteMany({ where: { apprenantId: INES } }),
    prisma.tentative.deleteMany({ where: { apprenantId: COBAYE } }),
    prisma.apprenant.deleteMany({ where: { id: COBAYE } }),
    prisma.apprenant.create({
      data: {
        id: COBAYE,
        etablissementId: ETABLISSEMENT,
        prenom: 'Noé',
        initialeNom: 'T',
        identifiant: 'test.correction',
      },
    }),
    prisma.tentative.create({
      data: {
        id: COPIE_DU_COBAYE,
        evaluationId: DEVOIR_EN_RETARD,
        apprenantId: COBAYE,
        etablissementId: ETABLISSEMENT,
        statut: 'attente_correction',
        score: 0,
        scoreMax: 20,
        soumiseLe: new Date(),
        reponses: {
          create: {
            questionId: QUESTION_REDIGEE,
            valeur: { type: 'texte_long', texte: 'Couper le moteur avant tout.' },
          },
        },
      },
    }),
  ])
}, 60_000)

afterAll(async () => {
  if (disponible) {
    // Une seule instruction : la suppression de l'élève emporte ses tentatives
    // et leurs réponses en cascade. Enchaîner les écritures ici est justement
    // ce qui cassait le socket.
    await prisma.apprenant.deleteMany({ where: { id: COBAYE } })
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

describe('échéances', () => {
  it('remonte le retard en tête, devant ce qui est simplement proche', async () => {
    if (!disponible) return

    const tableau = await chargerEcheances(INES, depot)

    expect(tableau.affichees.length).toBeGreaterThan(0)
    expect(tableau.affichees[0]?.evaluationId).toBe(DEVOIR_EN_RETARD)
    // Ordonné du plus pressant au moins pressant, jusqu'en base.
    const dates = tableau.affichees.map((e) => e.echeanceLe.getTime())
    expect([...dates].sort((a, b) => a - b)).toEqual(dates)
  })

  it('n’affiche pas une évaluation sans date de rendu', async () => {
    if (!disponible) return

    // NULL est le cas courant, pas une anomalie : un entraînement se refait
    // quand on veut et n'a rien à faire dans « À rendre ».
    const tableau = await chargerEcheances(INES, depot)
    const toutes = [...tableau.affichees, ...tableau.reste]
    expect(toutes.map((e) => e.evaluationId)).not.toContain(ENTRAINEMENT)
  })

  it('retire de la liste ce que l’élève a déjà rendu', async () => {
    if (!disponible) return

    // Même échéance, deux élèves, deux réponses : c'est la tentative soumise
    // de Léa qui fait la différence, et non un réglage d'affichage.
    const chezLea = await chargerEcheances(LEA, depot)
    const chezInes = await chargerEcheances(INES, depot)

    expect(chezLea.affichees.map((e) => e.evaluationId)).not.toContain(DEVOIR_EN_RETARD)
    expect(chezInes.affichees.map((e) => e.evaluationId)).toContain(DEVOIR_EN_RETARD)
  })

  it('renseigne le chapitre, que l’élève lit pour se repérer', async () => {
    if (!disponible) return

    const tableau = await chargerEcheances(INES, depot)
    expect(tableau.affichees.every((e) => e.chapitre.length > 0)).toBe(true)
  })
})

describe('correction par un enseignant', () => {
  const COPIE = COPIE_DU_COBAYE

  it('remonte la copie de Thomas dans la pile de l’établissement', async () => {
    if (!disponible) return

    const pile = await listerCopiesEnAttente(ETABLISSEMENT, depot)
    const copie = pile.find((c) => c.tentativeId === COPIE)

    expect(copie).toBeDefined()
    expect(copie?.prenom).toBe('Noé')
    expect(copie?.aNoter).toBe(1)
    // Prénom et initiale, jamais le nom complet — il n'existe pas en mode
    // minimal, et l'écran doit se comporter pareil dans les deux modes.
    expect(Object.keys(copie ?? {})).not.toContain('nom')
  })

  it('refuse une note hors barème sans rien écrire en base', async () => {
    if (!disponible) return

    const r = await noterCopie(
      COPIE,
      [{ questionId: QUESTION_REDIGEE, score: 200, commentaire: '' }],
      depot,
    )

    expect(r.ok).toBe(false)
    // La copie doit être restée intacte : le domaine tranche AVANT la base.
    const tentative = await prisma.tentative.findUnique({ where: { id: COPIE } })
    expect(tentative?.statut).toBe('attente_correction')
  })

  it('note la copie, la clôt, et enregistre le commentaire', async () => {
    if (!disponible) return

    const r = await noterCopie(
      COPIE,
      [
        {
          questionId: QUESTION_REDIGEE,
          score: 15,
          commentaire: 'Les trois règles y sont. Le « pourquoi » est juste.',
        },
      ],
      depot,
    )

    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.valeur.close).toBe(true)
    expect(r.valeur.score).toBe(15)
    expect(r.valeur.sansCommentaire).toEqual([])

    const tentative = await prisma.tentative.findUnique({ where: { id: COPIE } })
    expect(tentative?.statut).toBe('corrigee')
    expect(Number(tentative?.score)).toBe(15)

    const reponse = await prisma.reponse.findFirst({ where: { tentativeId: COPIE } })
    expect(Number(reponse?.score)).toBe(15)
    expect(reponse?.commentaire).toContain('trois règles')
  })

  it('sort la copie de la pile une fois corrigée', async () => {
    if (!disponible) return
    const pile = await listerCopiesEnAttente(ETABLISSEMENT, depot)
    expect(pile.map((c) => c.tentativeId)).not.toContain(COPIE)
  })

  it('refuse de rouvrir une copie close', async () => {
    if (!disponible) return

    // L'immuabilité d'une tentative corrigée vaut aussi contre la base : une
    // note ne change pas sans trace.
    const r = await noterCopie(
      COPIE,
      [{ questionId: QUESTION_REDIGEE, score: 20, commentaire: 'Finalement…' }],
      depot,
    )

    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erreur.code).toBe('conflit')
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
