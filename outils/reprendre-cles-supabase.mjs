#!/usr/bin/env node
/**
 * Reprend les clés Supabase d'un projet RAAI voisin.
 *
 *   node outils/reprendre-cles-supabase.mjs ../raai-designer-studio
 *
 * Copie de fichier à fichier, sans jamais afficher les valeurs : seuls les
 * NOMS des variables reprises sont journalisés. Une clé qui apparaît dans un
 * terminal finit dans un historique, et une capture d'écran finit dans une
 * conversation.
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync } from 'node:fs'
import { join } from 'node:path'

const REPRISES = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
]

const source = process.argv[2]
if (!source) {
  console.error('Usage : node outils/reprendre-cles-supabase.mjs <dossier-du-projet-voisin>')
  process.exit(1)
}

const fichierSource = join(source, '.env.local')
if (!existsSync(fichierSource)) {
  console.error(`Introuvable : ${fichierSource}`)
  process.exit(1)
}

const lire = (chemin) => {
  const valeurs = new Map()
  for (const ligne of readFileSync(chemin, 'utf8').split(/\r?\n/)) {
    const separateur = ligne.indexOf('=')
    if (separateur <= 0 || ligne.trimStart().startsWith('#')) continue
    valeurs.set(ligne.slice(0, separateur).trim(), ligne.slice(separateur + 1).trim())
  }
  return valeurs
}

const depuis = lire(fichierSource)
let contenu = readFileSync('.env.local', 'utf8')

// Sauvegarde avant de toucher au fichier : c'est le seul endroit où vivent des
// secrets qu'on ne peut pas redemander.
copyFileSync('.env.local', '.env.local.sauvegarde')

const reprises = []
const manquantes = []

for (const nom of REPRISES) {
  const valeur = depuis.get(nom)
  if (!valeur || valeur === '""' || valeur === "''") {
    manquantes.push(nom)
    continue
  }

  const ligne = `${nom}=${valeur.startsWith('"') ? valeur : `"${valeur.replace(/^'|'$/g, '')}"`}`
  const motif = new RegExp(`^${nom}=.*$`, 'm')

  contenu = motif.test(contenu) ? contenu.replace(motif, ligne) : `${contenu.trimEnd()}\n${ligne}\n`
  reprises.push(nom)
}

writeFileSync('.env.local', contenu)

console.log(`\nDepuis ${fichierSource} :`)
for (const nom of reprises) console.log(`  ✓ ${nom}`)
for (const nom of manquantes) console.log(`  · ${nom} — absente ou vide dans la source`)

console.log(
  `\nSauvegarde : .env.local.sauvegarde` +
    `\n\nIl reste à récupérer DATABASE_URL et DIRECT_URL : ce projet voisin` +
    `\nn'utilise pas Prisma, elles ne sont nulle part. Supabase › Project` +
    `\nSettings › Database › Connection string.\n`,
)
