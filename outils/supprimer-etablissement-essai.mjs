#!/usr/bin/env node
/**
 * Supprime « Établissement d'essai RAAI » (UAI 0000000E), créé par
 * `creer-comptes-essai.mjs` avant que la démonstration ne soit semée. Ses
 * membres, son élève et ses inscriptions partent en cascade ; les comptes
 * adultes restent, rattachés à la MFR Escatalens.
 *
 *   node outils/supprimer-etablissement-essai.mjs .env.vercel.local
 */
import { readFileSync } from 'node:fs'
import dotenv from 'dotenv'
import pg from 'pg'

const env = dotenv.parse(readFileSync(process.argv[2] ?? '.env.local'))
const client = new pg.Client({ connectionString: env.DIRECT_URL ?? env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
const { rowCount } = await client.query(`DELETE FROM raai_apprendre.etablissement WHERE uai = '0000000E'`)
console.log(rowCount ? 'Établissement d’essai supprimé.' : 'Aucun établissement d’essai à supprimer.')
await client.end()
