#!/usr/bin/env node
/**
 * Import d'un référentiel DGER depuis une URL ChloroFil ou un PDF local.
 *
 *   npm run referentiel:importer -- <url|chemin> [--json <sortie>]
 *
 * Produit un JSON à relire. N'écrit RIEN en base : la validation humaine est
 * obligatoire (doc 08 §6, doc 12 §5).
 */
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { basename, join } from 'node:path'
import { extraireReferentiel } from './extraire.mjs'

const TRAVAIL = join(import.meta.dirname, 'travail')

async function recuperer(source) {
  if (!/^https?:\/\//.test(source)) return source

  mkdirSync(TRAVAIL, { recursive: true })
  const destination = join(TRAVAIL, basename(new URL(source).pathname))
  if (existsSync(destination)) {
    console.log(`  (déjà téléchargé : ${destination})`)
    return destination
  }

  const reponse = await fetch(source)
  if (!reponse.ok) throw new Error(`Téléchargement impossible : HTTP ${reponse.status}`)
  writeFileSync(destination, Buffer.from(await reponse.arrayBuffer()))
  return destination
}

const [source, ...reste] = process.argv.slice(2)
if (!source) {
  console.error('Usage : npm run referentiel:importer -- <url|chemin.pdf> [--json <sortie>]')
  process.exit(1)
}

const chemin = await recuperer(source)
const resultat = extraireReferentiel(chemin)

console.log(`\nEmpreinte SHA-256 : ${resultat.empreinteSource}`)
console.log(`Arrêté détecté    : ${resultat.arrete.principal ?? '— aucun —'}`)
if (resultat.arrete.tous.length > 1) {
  console.log(`Arrêtés cités     : ${resultat.arrete.tous.join(' · ')}`)
}
console.log(
  `Extrait           : ${resultat.statistiques.capacites} capacités, ` +
    `${resultat.statistiques.sousCapacites} sous-capacités\n`,
)

for (const c of resultat.capacites) {
  const bloc = c.codeBloc ?? '  —'
  console.log(`${bloc}  ${c.code}  ${c.intitule}`)
  for (const s of c.sousCapacites) console.log(`          ${s.code}  ${s.intitule}`)
}

if (resultat.alertes.length > 0) {
  console.log('\nÀ vérifier :')
  for (const a of resultat.alertes) console.log(`  · ${a}`)
}

const indexJson = reste.indexOf('--json')
if (indexJson !== -1 && reste[indexJson + 1]) {
  writeFileSync(reste[indexJson + 1], JSON.stringify(resultat, null, 2))
  console.log(`\nÉcrit : ${reste[indexJson + 1]}`)
}

// Rappel systématique : le fichier nommé « en-vigueur » sur ChloroFil ne l'est
// pas toujours. On ne se fie jamais au nom de fichier.
console.log(
  '\nRien n\'a été écrit en base. Confronter l\'arrêté détecté à la fiche ' +
    'diplôme ChloroFil avant validation — le nom du fichier ne fait pas foi.',
)
