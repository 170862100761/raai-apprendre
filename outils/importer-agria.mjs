#!/usr/bin/env node
/**
 * Reprise du contenu de démonstration de raai-agria (même Bac Pro
 * Agroéquipement, même référentiel) : 8 leçons, 6 quiz, 4 fiches méthode.
 *
 *   node outils/importer-agria.mjs .env.vercel.local [--source D:/RAAI/raai-agria] [--uai 0820001A]
 *
 * Ce que ça devient ici :
 *   - une leçon Agria → une leçon à blocs `texte` (titres, paragraphes,
 *     encadrés préfixés « Sécurité : », « Astuce : », « Important : ») ;
 *     ses questions intégrées deviennent un quiz « Pour vérifier » sur le
 *     même chapitre — Apprendre n'a pas de bloc question dans une leçon, et
 *     c'est voulu : le corrigé ne doit jamais partir avec l'énoncé ;
 *   - un quiz Agria → une évaluation de type quiz, questions QCM ;
 *   - une fiche Agria (Markdown) → une leçon du chapitre « Fiches méthode et
 *     procédures », le Markdown réduit en texte.
 *
 * Les capacités Agria (C9.1, C8.2…) se rattachent à la capacité de rang 1
 * du référentiel semé (C9, C8…). Le contenu est publié directement : côté
 * Agria il est marqué relu, et c'est un humain qui lance ce script après
 * avoir lu le fichier — même règle que `demonstration.mjs` là-bas.
 *
 * Idempotent : identifiants dérivés de la source ; relancer met à jour sans
 * dupliquer. Une leçon passée en relecture ou archivée ici n'est pas touchée.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import dotenv from 'dotenv'
import pg from 'pg'

function argument(nom, defaut) {
  const rang = process.argv.indexOf(`--${nom}`)
  return rang >= 0 ? process.argv[rang + 1] : defaut
}
const fichierEnv = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.env.local'
const source = argument('source', 'D:/RAAI/raai-agria')
const uai = argument('uai', '0820001A')

const env = dotenv.parse(readFileSync(fichierEnv))
const url = env.DIRECT_URL ?? env.DATABASE_URL
if (!url) {
  console.error(`Ni DIRECT_URL ni DATABASE_URL dans ${fichierEnv}`)
  process.exit(1)
}

const idStable = (...parties) => {
  const h = createHash('sha256').update(parties.join('|')).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}
const idDemo = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

// Les chapitres du jeu de démonstration d'Apprendre, quand une leçon Agria y a sa place.
const MODULE_MP7 = idDemo(201)
const CHAPITRES_DEMO = {
  hydraulique: idDemo(202),
  securite: idDemo(203),
  transmission: idDemo(400),
  entretien: idDemo(401),
}

/** Où va chaque leçon Agria : chapitre existant, ou chapitre à créer dans MP7. */
const PLACEMENT = [
  { motif: /circuit hydraulique/i, chapitre: CHAPITRES_DEMO.hydraulique },
  { motif: /entretien périodique/i, chapitre: CHAPITRES_DEMO.entretien },
  { motif: /choisir un tracteur/i, nouveau: ['Choix des équipements', 5] },
  { motif: /chantier de récolte/i, nouveau: ['Organisation du chantier', 6] },
  { motif: /semoir/i, nouveau: ['Réglage des matériels de semis', 7] },
  { motif: /sécurité machine/i, chapitre: CHAPITRES_DEMO.securite },
  { motif: /moteur diesel/i, nouveau: ['Diagnostic moteur', 8] },
  { motif: /isobus|électricité/i, nouveau: ['Électricité embarquée et ISOBUS', 9] },
]
const CHAPITRE_FICHES = ['Fiches méthode et procédures', 10]

const PREFIXES_ENCADRE = { securite: 'Sécurité', astuce: 'Astuce', important: 'Important' }

const texte = (contenu) => ({ type: 'texte', texte: contenu })

/** Bloc Agria → blocs Apprendre (les questions sont ramassées à part). */
function convertirBloc(bloc, questions) {
  switch (bloc.type) {
    case 'titre':
      return [texte(bloc.texte)]
    case 'texte':
      return [texte(bloc.texte)]
    case 'encadre':
      return [texte(`${PREFIXES_ENCADRE[bloc.nature] ?? 'À noter'} : ${bloc.texte}`)]
    case 'question':
      questions.push(bloc)
      return []
    default:
      console.warn(`  type de bloc Agria inconnu, ignoré : ${bloc.type}`)
      return []
  }
}

/** Markdown d'une fiche → blocs texte, un par paragraphe ou par liste. */
function convertirMarkdown(corps) {
  const blocs = []
  for (const morceau of corps.split(/\n\s*\n/)) {
    const lignes = morceau
      .split('\n')
      .map((l) =>
        l
          .replace(/^#{1,6}\s*/, '')
          .replace(/^>\s?/, '')
          .replace(/^\s*[-*]\s*\[[ xX]\]\s*/, '☐ ')
          .replace(/^\s*[-*]\s+/, '– ')
          .replace(/\*\*(.+?)\*\*/g, '$1')
          .replace(/`(.+?)`/g, '$1')
          .trim(),
      )
      .filter((l) => l.length > 0)
    if (lignes.length) blocs.push(texte(lignes.join('\n')))
  }
  return blocs
}

/** Même estimation que le domaine : 180 mots par minute. */
function dureeEstimee(blocs) {
  const mots = blocs.reduce((n, b) => n + b.texte.split(/\s+/).length, 0)
  return Math.max(1, Math.round(mots / 180))
}

const capaciteRang1 = (code) => code.split('.')[0]

async function principal() {
  const contenu = JSON.parse(readFileSync(join(source, 'outils/contenu-demonstration.json'), 'utf8'))
  const bd = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await bd.connect()
  const q = async (sql, params = []) => (await bd.query(sql, params)).rows
  try {
    const etab = (await q(`SELECT id FROM raai_apprendre.etablissement WHERE uai = $1`, [uai]))[0]
    if (!etab) throw new Error(`Aucun établissement pour l'UAI ${uai}.`)
    const etablissementId = etab.id
    if (!(await q(`SELECT 1 FROM raai_apprendre.module_formation WHERE id = $1`, [MODULE_MP7])).length) {
      throw new Error('Le module MP7 du jeu de démonstration est absent : semer la démonstration d’abord.')
    }
    const competences = new Map(
      (await q(`SELECT id, code FROM raai_apprendre_ref.competence WHERE parent_id IS NULL`)).map((c) => [c.code, c.id]),
    )

    await bd.query('BEGIN')

    async function chapitre(titre, ordre) {
      const chapitreId = idStable('agria-chapitre', titre)
      await q(
        `INSERT INTO raai_apprendre.chapitre (id, module_id, titre, ordre) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET titre = EXCLUDED.titre, ordre = EXCLUDED.ordre`,
        [chapitreId, MODULE_MP7, titre, ordre],
      )
      return chapitreId
    }

    async function lecon(cle, chapitreId, titre, blocs, capacites) {
      const leconId = idStable('agria-lecon', cle)
      const existante = (await q(`SELECT statut FROM raai_apprendre.lecon WHERE id = $1`, [leconId]))[0]
      if (existante && existante.statut !== 'brouillon' && existante.statut !== 'publiee') {
        return { leconId, conservee: true }
      }
      await q(
        `INSERT INTO raai_apprendre.lecon (id, chapitre_id, etablissement_id, titre, statut, duree_estimee_min, publiee_le)
         VALUES ($1, $2, $3, $4, 'publiee', $5, now())
         ON CONFLICT (id) DO UPDATE SET titre = EXCLUDED.titre, duree_estimee_min = EXCLUDED.duree_estimee_min, chapitre_id = EXCLUDED.chapitre_id`,
        [leconId, chapitreId, etablissementId, titre, dureeEstimee(blocs)],
      )
      await q(`DELETE FROM raai_apprendre.bloc_contenu WHERE lecon_id = $1`, [leconId])
      for (const [rang, bloc] of blocs.entries()) {
        await q(
          `INSERT INTO raai_apprendre.bloc_contenu (id, lecon_id, type, contenu, ordre, genere_par_ia)
           VALUES ($1, $2, $3, $4, $5, true)`,
          [idStable('agria-bloc', cle, String(rang)), leconId, bloc.type, bloc, rang],
        )
      }
      for (const code of new Set(capacites.map(capaciteRang1))) {
        const competenceId = competences.get(code)
        if (!competenceId) {
          console.warn(`  capacité ${code} absente du référentiel semé, lien ignoré`)
          continue
        }
        await q(
          `INSERT INTO raai_apprendre.lien_competence (id, lecon_id, competence_id) VALUES ($1, $2, $3)
           ON CONFLICT (lecon_id, competence_id) DO NOTHING`,
          [idStable('agria-lien', cle, code), leconId, competenceId],
        )
      }
      return { leconId, conservee: false }
    }

    async function quiz(cle, chapitreId, titre, questions) {
      const quizId = idStable('agria-quiz', cle)
      await q(
        `INSERT INTO raai_apprendre.evaluation (id, chapitre_id, etablissement_id, titre, type, statut, duree_max_min)
         VALUES ($1, $2, $3, $4, 'quiz', 'publiee', 15)
         ON CONFLICT (id) DO UPDATE SET titre = EXCLUDED.titre, chapitre_id = EXCLUDED.chapitre_id`,
        [quizId, chapitreId, etablissementId, titre],
      )
      for (const [rang, question] of questions.entries()) {
        await q(
          `INSERT INTO raai_apprendre.question (id, evaluation_id, type, enonce, options, corrige, bareme, ordre, genere_par_ia)
           VALUES ($1, $2, 'qcm', $3, $4, $5, 2, $6, true)
           ON CONFLICT (id) DO UPDATE SET enonce = EXCLUDED.enonce, options = EXCLUDED.options, corrige = EXCLUDED.corrige`,
          [
            idStable('agria-question', cle, String(rang)),
            quizId,
            question.enonce,
            JSON.stringify({ propositions: question.propositions }),
            JSON.stringify({ bonnes: question.bonnesReponses }),
            rang + 1,
          ],
        )
      }
    }

    let lecons = 0
    let quizzes = 0
    let conservees = 0
    const chapitreParLecon = []

    for (const [rang, source] of contenu.lecons.entries()) {
      const place = PLACEMENT.find((p) => p.motif.test(source.titre))
      if (!place) {
        console.warn(`  leçon sans placement, ignorée : ${source.titre}`)
        continue
      }
      const chapitreId = place.chapitre ?? (await chapitre(...place.nouveau))
      chapitreParLecon.push(chapitreId)
      const questions = []
      const blocs = source.blocs.flatMap((b) => convertirBloc(b, questions))
      const capacites = source.blocs.flatMap((b) => b.capacites ?? [])
      const cle = `lecon-${rang}`
      const resultat = await lecon(cle, chapitreId, source.titre, blocs, capacites)
      if (resultat.conservee) {
        conservees++
        continue
      }
      lecons++
      if (questions.length) {
        await quiz(`${cle}-verif`, chapitreId, `Pour vérifier — ${source.titre.split(' — ')[0]}`, questions)
        quizzes++
      }
    }

    // Les six quiz : chacun sur le chapitre de la leçon dont il parle.
    const CORRESPONDANCE_QUIZ = [/hydraulique/i, /maintenance/i, /équipement|lestage/i, /chantier/i, /sécurité/i, /moteur/i]
    for (const [rang, source] of contenu.quizzes.entries()) {
      const motif = CORRESPONDANCE_QUIZ.find((m) => m.test(source.titre))
      const indexLecon = motif ? contenu.lecons.findIndex((l) => motif.test(l.titre)) : -1
      const chapitreId = chapitreParLecon[indexLecon] ?? CHAPITRES_DEMO.hydraulique
      await quiz(`quiz-${rang}`, chapitreId, source.titre, source.questions)
      quizzes++
    }

    // Les fiches : un chapitre à elles, une leçon par fiche.
    const chapitreFiches = await chapitre(...CHAPITRE_FICHES)
    for (const [rang, fiche] of contenu.fiches.entries()) {
      const resultat = await lecon(`fiche-${rang}`, chapitreFiches, fiche.titre, convertirMarkdown(fiche.corps), fiche.capacites ?? [])
      if (resultat.conservee) conservees++
      else lecons++
    }

    await bd.query('COMMIT')
    console.log(
      `Reprise Agria terminée : ${lecons} leçon(s) publiée(s), ${quizzes} quiz` +
        (conservees ? `, ${conservees} leçon(s) conservée(s) (relecture en cours)` : '') +
        '.',
    )
  } catch (e) {
    await bd.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    await bd.end()
  }
}

principal().catch((erreur) => {
  console.error(erreur.message)
  process.exit(1)
})
