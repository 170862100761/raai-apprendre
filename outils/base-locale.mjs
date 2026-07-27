#!/usr/bin/env node
/**
 * Base de développement locale : PostgreSQL en WASM, servi sur un port TCP.
 *
 * Ni Docker ni installation. C'est un choix assumé pour le développement et la
 * démonstration : un environnement qui demande une installation préalable est
 * un environnement où l'on ne lance pas l'application « juste pour vérifier ».
 * La production, elle, tourne sur Supabase.
 *
 *   node outils/base-locale.mjs [--port 5433] [--semer]
 */
import { PGlite } from '@electric-sql/pglite'
import { PGLiteSocketServer } from '@electric-sql/pglite-socket'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const port = Number(process.argv.includes('--port')
  ? process.argv[process.argv.indexOf('--port') + 1]
  : 5433)

const bd = await PGlite.create()

// Rôles et fonctions que Supabase fournit et dont dépendent nos politiques.
await bd.exec(`
  CREATE SCHEMA IF NOT EXISTS auth;
  DO $$ BEGIN CREATE ROLE anon NOLOGIN NOINHERIT;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN CREATE ROLE authenticated NOLOGIN NOINHERIT;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $f$
    SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
  $f$;
`)

const migrations = join(import.meta.dirname, '..', 'prisma', 'migrations')
for (const dossier of readdirSync(migrations).sort()) {
  await bd.exec(readFileSync(join(migrations, dossier, 'migration.sql'), 'utf8'))
  console.log(`  migration  ${dossier}`)
}

if (process.argv.includes('--semer')) {
  const { semer } = await import('./semer-demo.mjs')
  await semer(bd)
}

const serveur = new PGLiteSocketServer({ db: bd, port, host: '127.0.0.1' })
await serveur.start()

console.log(`\nBase prête : postgresql://postgres:postgres@127.0.0.1:${port}/postgres`)
console.log('Données en mémoire : tout disparaît à l\'arrêt. Ctrl+C pour quitter.\n')

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, async () => {
    await serveur.stop()
    await bd.close()
    process.exit(0)
  })
}
