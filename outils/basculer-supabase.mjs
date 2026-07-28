#!/usr/bin/env node
/**
 * Active ou neutralise les trois variables Supabase de `.env.local`.
 *
 *   node outils/basculer-supabase.mjs off   # commente — chemin transitoire
 *   node outils/basculer-supabase.mjs on    # décommente — Supabase Auth
 *
 * Commenter plutôt que supprimer : les valeurs sont pénibles à retrouver, et
 * une clé effacée par mégarde se repaie en aller-retour dans le tableau de bord.
 * N'affiche jamais les valeurs, seulement les noms.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'

const VARIABLES = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]

const mode = process.argv[2]
if (mode !== 'on' && mode !== 'off') {
  console.error('Usage : node outils/basculer-supabase.mjs on|off')
  process.exit(1)
}

if (!existsSync('.env.local')) {
  console.error('.env.local introuvable.')
  process.exit(1)
}

copyFileSync('.env.local', '.env.local.sauvegarde')

const lignes = readFileSync('.env.local', 'utf8').split(/\r?\n/)
const touchees = []

const resultat = lignes.map((ligne) => {
  for (const nom of VARIABLES) {
    if (mode === 'off' && ligne.startsWith(`${nom}=`)) {
      touchees.push(nom)
      return `#${ligne}`
    }
    if (mode === 'on' && ligne.startsWith(`#${nom}=`)) {
      touchees.push(nom)
      return ligne.slice(1)
    }
  }
  return ligne
})

writeFileSync('.env.local', resultat.join('\n'))

console.log(mode === 'off' ? '\nNeutralisées :' : '\nRéactivées :')
for (const nom of touchees) console.log(`  ✓ ${nom}`)
if (touchees.length === 0) console.log('  (rien à faire)')
console.log('\nSauvegarde : .env.local.sauvegarde\nRedémarre `npm run dev`.\n')
