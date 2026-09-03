#!/usr/bin/env node
/**
 * Convertit `contenu/bacpro-ae/*.json` (format Apprendre) au format de
 * démonstration d'Agria, dans `D:/RAAI/raai-agria/outils/contenu-apprendre.json`
 * — même Bac Pro, même référentiel, la matière circule dans les deux sens.
 *
 *   node outils/exporter-vers-agria.mjs [--cible D:/RAAI/raai-agria/outils/contenu-apprendre.json]
 *
 * Ce qui change de forme :
 *   - un bloc texte dont la première ligne est un intertitre devient un bloc
 *     `titre` suivi d'un bloc `texte` ; « Sécurité : », « Astuce : », « À
 *     retenir : » deviennent des encadrés ;
 *   - un quiz devient un quiz Agria (QCM seulement) : vrai/faux → deux
 *     propositions, numérique → la bonne valeur et trois leurres, texte court
 *     → la bonne formulation et trois leurres pris dans les autres réponses
 *     courtes du même quiz ; l'explication est conservée.
 * Rien n'est écrit en base ici : `raai-agria/outils/poser-contenu.mjs` s'en charge.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function argument(nom, defaut) {
  const rang = process.argv.indexOf(`--${nom}`)
  return rang >= 0 ? process.argv[rang + 1] : defaut
}
const DOSSIER = fileURLToPath(new URL('../contenu/bacpro-ae/', import.meta.url))
const cible = argument('cible', 'D:/RAAI/raai-agria/outils/contenu-apprendre.json')

const ENCADRES = [
  [/^Sécurité\s*:\s*/i, 'securite'],
  [/^Astuce\s*:\s*/i, 'astuce'],
  [/^(À retenir|A retenir|Important)\s*:\s*/i, 'important'],
]

function convertirBloc(texte, capacites) {
  const brut = texte.trim()
  for (const [motif, nature] of ENCADRES) {
    if (motif.test(brut)) return [{ type: 'encadre', nature, texte: brut.replace(motif, ''), capacites }]
  }
  const lignes = brut.split('\n')
  // Un intertitre : une première ligne courte, sans point final, suivie d'un texte.
  if (lignes.length > 1 && lignes[0].length <= 90 && !/[.!?]$/.test(lignes[0].trim())) {
    return [
      { type: 'titre', texte: lignes[0].trim(), niveau: 2, capacites },
      { type: 'texte', texte: lignes.slice(1).join('\n').trim(), capacites },
    ]
  }
  return [{ type: 'texte', texte: brut, capacites }]
}

const formaterNombre = (v) => (Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100).replace('.', ','))

function convertirQuestion(question, autresCourtes) {
  const base = { capacites: [], explication: question.explication }
  switch (question.type) {
    case 'qcm':
      return { ...base, enonce: question.enonce, propositions: question.propositions, bonnesReponses: [...question.bonnes] }
    case 'vrai_faux':
      return { ...base, enonce: question.enonce, propositions: ['Vrai', 'Faux'], bonnesReponses: [question.bonne ? 0 : 1] }
    case 'numerique': {
      const v = question.valeur
      const unite = question.unite ? ` ${question.unite}` : ''
      const leurres = [v * 2, v / 2, v * 10 === 0 ? v + 1 : v * 10].map((x) => Math.round(x * 100) / 100)
      const propositions = [v, ...leurres].map((x) => `${formaterNombre(x)}${unite}`)
      return { ...base, enonce: question.enonce, propositions, bonnesReponses: [0] }
    }
    case 'texte_court': {
      const bonne = question.acceptees[0]
      const leurres = autresCourtes.filter((a) => a.toLowerCase() !== bonne.toLowerCase()).slice(0, 3)
      if (leurres.length < 2) return null
      return { ...base, enonce: question.enonce, propositions: [bonne, ...leurres], bonnesReponses: [0] }
    }
    default:
      return null
  }
}

const lecons = []
const quizzes = []
for (const fichier of readdirSync(DOSSIER).filter((f) => f.endsWith('.json')).sort()) {
  const contenu = JSON.parse(readFileSync(DOSSIER + fichier, 'utf8'))
  for (const chapitre of contenu.chapitres) {
    for (const lecon of chapitre.lecons) {
      const capacites = lecon.capacites
      lecons.push({
        cle: lecon.cle,
        module: contenu.module.code,
        chapitre: chapitre.titre,
        titre: lecon.titre,
        blocs: lecon.blocs.flatMap((b) => convertirBloc(b.texte, capacites)),
      })
      if (lecon.quiz?.questions?.length) {
        const courtes = lecon.quiz.questions.filter((q) => q.type === 'texte_court').flatMap((q) => q.acceptees.slice(0, 1))
        const questions = lecon.quiz.questions
          .map((q) => convertirQuestion(q, courtes))
          .filter(Boolean)
          .map((q) => ({ ...q, capacites }))
        if (questions.length >= 3) {
          quizzes.push({ cle: lecon.cle, titre: lecon.quiz.titre ?? `Pour vérifier — ${lecon.titre}`, questions })
        }
      }
    }
  }
}
writeFileSync(
  cible,
  JSON.stringify(
    {
      avertissement:
        "Contenu rédigé pour RAAI Apprendre (contenu/bacpro-ae), généré par IA, converti au format Agria par outils/exporter-vers-agria.mjs. À relire par un enseignant avant tout usage certificatif.",
      lecons,
      quizzes,
    },
    null,
    2,
  ) + '\n',
  'utf8',
)
console.log(`${lecons.length} leçon(s) et ${quizzes.length} quiz exportés vers ${cible}`)
