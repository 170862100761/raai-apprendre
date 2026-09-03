#!/usr/bin/env node
/**
 * Pose en base le contenu de `contenu/bacpro-ae/*.json` : modules, chapitres,
 * leçons à blocs texte, quiz avec explications, liens aux capacités.
 *
 *   node outils/importer-contenu.mjs .env.vercel.local [--uai 0820001A] [--fichier MP5]
 *
 * Idempotent : identifiants dérivés des clés, relancer met à jour. Une leçon
 * passée en relecture ou archivée par un enseignant n'est plus touchée : la
 * relecture humaine prime sur le fichier.
 *
 * Les leçons sont publiées à l'import (choix de Raphaël, 3 septembre 2026 :
 * de la matière visible) et marquées générées par IA sur chaque bloc et
 * chaque question — c'est ce qui dit à l'enseignant qu'elles attendent sa
 * relecture. Les liens de compétence visent la capacité citée ET sa capacité
 * de rang 1 : la grille de suivi ne montre que le rang 1.
 */
import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'

function argument(nom, defaut) {
  const rang = process.argv.indexOf(`--${nom}`)
  return rang >= 0 ? process.argv[rang + 1] : defaut
}
const fichierEnv = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.env.local'
const uai = argument('uai', '0820001A')
const seulement = argument('fichier', null)

const env = dotenv.parse(readFileSync(fichierEnv))
const url = env.DIRECT_URL ?? env.DATABASE_URL
if (!url) {
  console.error(`Ni DIRECT_URL ni DATABASE_URL dans ${fichierEnv}`)
  process.exit(1)
}
const DOSSIER = fileURLToPath(new URL('../contenu/bacpro-ae/', import.meta.url))
const idStable = (...parties) => {
  const h = createHash('sha256').update(parties.join('|')).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}
const idDemo = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const MATIERES = {
  AGROEQ: { id: idDemo(200), intitule: 'Agroéquipement' },
  GENERAL: { id: idStable('contenu-matiere', 'GENERAL'), intitule: 'Enseignements généraux' },
}
/** Le module MP7 du jeu de démonstration garde son identifiant : ses chapitres y sont. */
const MODULES_DEMO = { MP7: idDemo(201) }

/** Mélange déterministe des propositions d'un QCM (graine = énoncé). */
function melanger(propositions, enonce) {
  const graine = createHash('sha256').update(enonce).digest()
  const ordre = propositions.map((_, i) => i)
  for (let i = ordre.length - 1; i > 0; i--) {
    const j = graine[i % graine.length] % (i + 1)
    ;[ordre[i], ordre[j]] = [ordre[j], ordre[i]]
  }
  return ordre
}

function normaliserQuestion(question) {
  switch (question.type) {
    case 'qcm': {
      const ordre = melanger(question.propositions, question.enonce)
      return {
        type: 'qcm',
        options: { propositions: ordre.map((i) => question.propositions[i]) },
        corrige: { bonnes: question.bonnes.map((b) => ordre.indexOf(b)).sort((a, b) => a - b) },
      }
    }
    case 'vrai_faux':
      return { type: 'vrai_faux', options: {}, corrige: { bonne: question.bonne } }
    case 'numerique':
      return {
        type: 'numerique',
        options: question.unite ? { unite: question.unite } : {},
        corrige: { valeur: question.valeur, tolerance: question.tolerance ?? 0 },
      }
    case 'texte_court':
      return { type: 'texte_court', options: {}, corrige: { acceptees: question.acceptees } }
    case 'texte_long':
      return { type: 'texte_long', options: {}, corrige: {} }
    default:
      throw new Error(`type de question inconnu : ${question.type}`)
  }
}

function verifier(fichier, contenu) {
  const erreurs = []
  if (!contenu.module?.code || !MATIERES[contenu.module.matiere]) erreurs.push('module.code ou module.matiere manquant')
  for (const chapitre of contenu.chapitres ?? []) {
    for (const lecon of chapitre.lecons ?? []) {
      if (!lecon.cle || !lecon.titre) erreurs.push(`leçon sans clé ou sans titre dans « ${chapitre.titre} »`)
      if (!lecon.capacites?.length) erreurs.push(`${lecon.cle} : aucune capacité`)
      if (!lecon.blocs?.length) erreurs.push(`${lecon.cle} : aucun bloc`)
      for (const bloc of lecon.blocs ?? []) {
        if (bloc.type !== 'texte' || !bloc.texte?.trim()) erreurs.push(`${lecon.cle} : bloc qui n'est pas un texte non vide`)
        if ((bloc.texte ?? '').length > 20_000) erreurs.push(`${lecon.cle} : bloc trop long`)
      }
      for (const q of lecon.quiz?.questions ?? []) {
        if (!q.enonce || !q.explication) erreurs.push(`${lecon.cle} : question sans énoncé ou sans explication`)
        if (q.type === 'qcm' && (!Array.isArray(q.propositions) || q.propositions.length < 2 || !q.bonnes?.length || q.bonnes.some((b) => b < 0 || b >= q.propositions.length))) {
          erreurs.push(`${lecon.cle} : QCM mal formé (« ${q.enonce?.slice(0, 40)} »)`)
        }
        if (q.type === 'texte_court' && !q.acceptees?.length) erreurs.push(`${lecon.cle} : texte_court sans réponses acceptées`)
        if (q.type === 'numerique' && typeof q.valeur !== 'number') erreurs.push(`${lecon.cle} : numérique sans valeur`)
        if (q.type === 'vrai_faux' && typeof q.bonne !== 'boolean') erreurs.push(`${lecon.cle} : vrai_faux sans bonne`)
      }
    }
  }
  if (erreurs.length) throw new Error(`${fichier} :\n  - ${erreurs.join('\n  - ')}`)
}

const dureeEstimee = (blocs) => Math.max(1, Math.round(blocs.reduce((n, b) => n + b.texte.split(/\s+/).length, 0) / 180))

async function principal() {
  const fichiers = readdirSync(DOSSIER)
    .filter((f) => f.endsWith('.json') && (!seulement || f.toLowerCase().startsWith(seulement.toLowerCase())))
    .sort()
  if (!fichiers.length) throw new Error('aucun fichier de contenu')
  const contenus = fichiers.map((f) => {
    const contenu = JSON.parse(readFileSync(DOSSIER + f, 'utf8'))
    verifier(f, contenu)
    return contenu
  })
  const cles = contenus.flatMap((c) => c.chapitres.flatMap((ch) => ch.lecons.map((l) => l.cle)))
  const doublons = cles.filter((c, i) => cles.indexOf(c) !== i)
  if (doublons.length) throw new Error(`clés de leçon en double : ${[...new Set(doublons)].join(', ')}`)

  const bd = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
  await bd.connect()
  const q = async (sql, params = []) => (await bd.query(sql, params)).rows
  try {
    const etab = (await q(`SELECT id FROM raai_apprendre.etablissement WHERE uai = $1`, [uai]))[0]
    if (!etab) throw new Error(`Aucun établissement pour l'UAI ${uai}.`)
    const competences = new Map(
      (await q(`SELECT c.id, c.code, p.id AS parent FROM raai_apprendre_ref.competence c LEFT JOIN raai_apprendre_ref.competence p ON p.id = c.parent_id`)).map((c) => [c.code, c]),
    )

    await bd.query('BEGIN')
    let lecons = 0
    let questions = 0
    let conservees = 0

    for (const contenu of contenus) {
      const matiere = MATIERES[contenu.module.matiere]
      await q(
        `INSERT INTO raai_apprendre.matiere (id, etablissement_id, code, intitule) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET intitule = EXCLUDED.intitule`,
        [matiere.id, etab.id, contenu.module.matiere, matiere.intitule],
      )
      const moduleId = MODULES_DEMO[contenu.module.code] ?? idStable('contenu-module', contenu.module.code)
      await q(
        `INSERT INTO raai_apprendre.module_formation (id, matiere_id, code, intitule, ordre) VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (id) DO UPDATE SET intitule = EXCLUDED.intitule, ordre = EXCLUDED.ordre`,
        [moduleId, matiere.id, contenu.module.code, contenu.module.intitule, contenu.module.ordre],
      )

      for (const chapitre of contenu.chapitres) {
        const chapitreId = idStable('contenu-chapitre', contenu.module.code, chapitre.titre)
        await q(
          `INSERT INTO raai_apprendre.chapitre (id, module_id, titre, ordre) VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET titre = EXCLUDED.titre, ordre = EXCLUDED.ordre`,
          [chapitreId, moduleId, chapitre.titre, chapitre.ordre],
        )

        for (const lecon of chapitre.lecons) {
          const leconId = idStable('contenu-lecon', lecon.cle)
          const existante = (await q(`SELECT statut FROM raai_apprendre.lecon WHERE id = $1`, [leconId]))[0]
          if (existante && existante.statut !== 'brouillon' && existante.statut !== 'publiee') {
            conservees++
            continue
          }
          await q(
            `INSERT INTO raai_apprendre.lecon (id, chapitre_id, etablissement_id, titre, statut, duree_estimee_min, publiee_le)
             VALUES ($1, $2, $3, $4, 'publiee', $5, now())
             ON CONFLICT (id) DO UPDATE SET titre = EXCLUDED.titre, duree_estimee_min = EXCLUDED.duree_estimee_min, chapitre_id = EXCLUDED.chapitre_id`,
            [leconId, chapitreId, etab.id, lecon.titre, dureeEstimee(lecon.blocs)],
          )
          await q(`DELETE FROM raai_apprendre.bloc_contenu WHERE lecon_id = $1`, [leconId])
          for (const [rang, bloc] of lecon.blocs.entries()) {
            await q(
              `INSERT INTO raai_apprendre.bloc_contenu (id, lecon_id, type, contenu, ordre, genere_par_ia) VALUES ($1, $2, 'texte', $3, $4, true)`,
              [idStable('contenu-bloc', lecon.cle, String(rang)), leconId, { type: 'texte', texte: bloc.texte.trim() }, rang],
            )
          }
          const cibles = new Set()
          for (const code of lecon.capacites) {
            const c = competences.get(code)
            if (!c) {
              console.warn(`  ${lecon.cle} : capacité ${code} inconnue, ignorée`)
              continue
            }
            cibles.add(c.id)
            if (c.parent) cibles.add(c.parent)
          }
          for (const competenceId of cibles) {
            await q(
              `INSERT INTO raai_apprendre.lien_competence (id, lecon_id, competence_id) VALUES ($1, $2, $3)
               ON CONFLICT (lecon_id, competence_id) DO NOTHING`,
              [idStable('contenu-lien', lecon.cle, competenceId), leconId, competenceId],
            )
          }
          lecons++

          if (lecon.quiz?.questions?.length) {
            const quizId = idStable('contenu-quiz', lecon.cle)
            await q(
              `INSERT INTO raai_apprendre.evaluation (id, chapitre_id, etablissement_id, titre, type, statut, duree_max_min)
               VALUES ($1, $2, $3, $4, 'quiz', 'publiee', 15)
               ON CONFLICT (id) DO UPDATE SET titre = EXCLUDED.titre, chapitre_id = EXCLUDED.chapitre_id`,
              [quizId, chapitreId, etab.id, lecon.quiz.titre ?? `Pour vérifier — ${lecon.titre}`],
            )
            for (const [rang, question] of lecon.quiz.questions.entries()) {
              const n = normaliserQuestion(question)
              await q(
                `INSERT INTO raai_apprendre.question (id, evaluation_id, type, enonce, options, corrige, bareme, ordre, genere_par_ia, explication)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true, $9)
                 ON CONFLICT (id) DO UPDATE SET type = EXCLUDED.type, enonce = EXCLUDED.enonce, options = EXCLUDED.options,
                   corrige = EXCLUDED.corrige, bareme = EXCLUDED.bareme, ordre = EXCLUDED.ordre, explication = EXCLUDED.explication`,
                [
                  idStable('contenu-question', lecon.cle, String(rang)),
                  quizId,
                  n.type,
                  question.enonce,
                  JSON.stringify(n.options),
                  JSON.stringify(n.corrige),
                  question.bareme ?? 1,
                  rang + 1,
                  question.explication,
                ],
              )
              questions++
            }
          }
        }
      }
    }
    await bd.query('COMMIT')
    console.log(
      `Contenu importé : ${fichiers.length} module(s), ${lecons} leçon(s) publiée(s), ${questions} question(s)` +
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
