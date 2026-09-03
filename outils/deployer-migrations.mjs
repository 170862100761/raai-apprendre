#!/usr/bin/env node
/**
 * Applique les migrations sur la base d'un fichier d'environnement donné.
 *
 *   node outils/deployer-migrations.mjs .env.vercel.local
 *
 * Premier essai : `prisma migrate deploy`, qui ne réinitialise jamais rien.
 * Sur un projet Supabase PARTAGÉ (Formation, Studio, raai_core y vivent déjà),
 * Prisma répond P3005 « la base n'est pas vide » tant que son journal
 * `_prisma_migrations` n'existe pas. Dans ce cas, on fait à la main ce que
 * `deploy` aurait fait : exécuter chaque migration.sql dans l'ordre
 * (`prisma db execute`), puis l'inscrire au journal (`prisma migrate resolve
 * --applied`), qui crée le journal au passage. Les migrations suivantes
 * repasseront par `deploy` normalement.
 *
 * Les valeurs ne sont jamais affichées : seul le nom d'hôte l'est.
 */
import { spawnSync } from 'node:child_process'
import { readFileSync, readdirSync } from 'node:fs'
import dotenv from 'dotenv'

const fichier = process.argv[2] ?? '.env.local'
const env = dotenv.parse(readFileSync(fichier))
const url = env.DIRECT_URL ?? env.DATABASE_URL
if (!url) {
  console.error(`Ni DIRECT_URL ni DATABASE_URL dans ${fichier}`)
  process.exit(1)
}
console.log(`migrations vers ${new URL(url).hostname}`)
const environnement = { ...process.env, DATABASE_URL: url, DIRECT_URL: url }
const prisma = (args, silencieux = false) =>
  spawnSync('npx', ['prisma', ...args], {
    shell: true,
    env: environnement,
    encoding: 'utf8',
    stdio: silencieux ? 'pipe' : 'inherit',
  })

const deploiement = prisma(['migrate', 'deploy'], true)
if (deploiement.status === 0) {
  console.log(deploiement.stdout.trim().split('\n').slice(-3).join('\n'))
  process.exit(0)
}
if (!/P3005/.test(deploiement.stderr + deploiement.stdout)) {
  console.error(deploiement.stderr || deploiement.stdout)
  process.exit(deploiement.status ?? 1)
}

console.log('Base partagée sans journal Prisma (P3005) : application manuelle, migration par migration.')
const dossiers = readdirSync('prisma/migrations', { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .sort()
for (const nom of dossiers) {
  console.log(`  → ${nom}`)
  const exec = prisma(['db', 'execute', '--file', `prisma/migrations/${nom}/migration.sql`, '--schema', 'prisma/schema.prisma'], true)
  if (exec.status !== 0) {
    console.error(exec.stderr || exec.stdout)
    process.exit(exec.status ?? 1)
  }
  const resolu = prisma(['migrate', 'resolve', '--applied', nom], true)
  if (resolu.status !== 0) {
    console.error(resolu.stderr || resolu.stdout)
    process.exit(resolu.status ?? 1)
  }
}
console.log(`${dossiers.length} migrations appliquées et inscrites au journal.`)
