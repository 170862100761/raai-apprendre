#!/usr/bin/env node
/**
 * Garde-fou devant `prisma migrate dev`.
 *
 * `migrate dev` peut proposer de **réinitialiser la base entière** quand il
 * détecte une dérive. Sur un projet Supabase partagé entre plusieurs
 * applications RAAI, cela effacerait aussi les schémas des autres — sur une
 * simple confirmation donnée trop vite, un soir de fatigue.
 *
 * Ce script refuse donc de s'exécuter ailleurs qu'en local. Pour appliquer des
 * migrations sur Supabase : `npm run bd:deployer` (`migrate deploy`), qui ne
 * réinitialise jamais rien.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, existsSync } from 'node:fs'

function lireUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL

  for (const fichier of ['.env.local', '.env']) {
    if (!existsSync(fichier)) continue
    const ligne = readFileSync(fichier, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith('DATABASE_URL='))
    if (ligne) return ligne.slice('DATABASE_URL='.length).replace(/^"|"$/g, '')
  }
  return null
}

const url = lireUrl()

if (!url) {
  console.error('DATABASE_URL introuvable.')
  process.exit(1)
}

const local = /@(127\.0\.0\.1|localhost|\[::1\])[:\/]/.test(url)

if (!local) {
  // On n'affiche pas l'URL : elle contient un mot de passe.
  const hote = url.replace(/^.*@/, '').replace(/[:\/].*$/, '')
  console.error(
    `\nRefus : « migrate dev » ne s'exécute qu'en local.\n\n` +
      `  Base visée : ${hote}\n\n` +
      `« migrate dev » peut proposer de réinitialiser la base entière. Si ce\n` +
      `projet Supabase héberge aussi raai_formation, raai_agri ou\n` +
      `raai_designer, leurs schémas partiraient avec.\n\n` +
      `Pour appliquer les migrations sur Supabase :\n` +
      `  npm run bd:deployer\n`,
  )
  process.exit(1)
}

const resultat = spawnSync('npx', ['prisma', 'migrate', 'dev', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: true,
})

process.exit(resultat.status ?? 1)
