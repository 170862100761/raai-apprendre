#!/usr/bin/env node
/**
 * Liste les schémas de la base et le nombre de tables de chacun. Aucun
 * contenu n'est lu : c'est le premier réflexe quand une table « n'existe pas ».
 *
 *   node outils/lister-schemas.mjs .env.vercel.local
 */
import { readFileSync } from 'node:fs'
import dotenv from 'dotenv'
import pg from 'pg'

const env = dotenv.parse(readFileSync(process.argv[2] ?? '.env.local'))
const url = env.DIRECT_URL ?? env.DATABASE_URL
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()
const { rows } = await client.query(`
  select n.nspname as schema, count(c.oid)::int as tables
  from pg_namespace n
  left join pg_class c on c.relnamespace = n.oid and c.relkind = 'r'
  where n.nspname not like 'pg_%' and n.nspname <> 'information_schema'
  group by n.nspname order by n.nspname`)
for (const r of rows) console.log(`${r.schema.padEnd(28)} ${r.tables} tables`)
await client.end()
