#!/usr/bin/env node
/**
 * Sème le jeu de démonstration (`semer-demo.mjs`) sur une base Supabase, puis
 * rattache les comptes d'essai (`creer-comptes-essai.mjs`) à l'établissement
 * et à la classe de démonstration, pour qu'ils aient quelque chose à voir.
 *
 *   node outils/semer-production.mjs .env.vercel.local
 *
 * Le semeur écrit ses lignes avec des identifiants fixes. Deux d'entre elles
 * (le pays FR, l'académie TOULOUSE) ont peut-être déjà été créées par le
 * script des comptes d'essai, sous d'autres identifiants : on les laisse en
 * place et on substitue leur vrai identifiant dans les requêtes suivantes.
 * Le reste (MFR Escatalens, référentiel, classe, élèves, cours) n'existe pas
 * encore : le semeur s'arrête net s'il le trouve, plutôt que de dupliquer.
 */
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import dotenv from 'dotenv'
import pg from 'pg'
import { semer } from './semer-demo.mjs'

const env = dotenv.parse(readFileSync(process.argv[2] ?? '.env.local'))
const url = env.DIRECT_URL ?? env.DATABASE_URL
const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()
console.log(`semis vers ${new URL(url).hostname}`)

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const deja = await client.query(`SELECT 1 FROM raai_apprendre.etablissement WHERE uai = '0820001A'`)
if (deja.rowCount) {
  console.log('MFR Escatalens existe déjà : le jeu de démonstration est en place, rien à semer.')
} else {
  const substitutions = new Map()
  const bd = {
    async query(sql, params = []) {
      const parametres = params.map((p) => (typeof p === 'string' && substitutions.has(p) ? substitutions.get(p) : p))
      if (/INSERT INTO raai_apprendre\.pays\b/.test(sql)) {
        await client.query(sql.replace(/\)\s*$/, ') ON CONFLICT (code) DO NOTHING'), parametres)
        const r = await client.query(`SELECT id FROM raai_apprendre.pays WHERE code = 'FR'`)
        substitutions.set(id(1), r.rows[0].id)
        return r
      }
      if (/INSERT INTO raai_apprendre\.academie\b/.test(sql)) {
        await client.query(sql.replace(/\)\s*$/, ') ON CONFLICT (code) DO NOTHING'), parametres)
        const r = await client.query(`SELECT id FROM raai_apprendre.academie WHERE code = 'TOULOUSE'`)
        substitutions.set(id(2), r.rows[0].id)
        return r
      }
      return client.query(sql, parametres)
    },
  }
  await client.query('BEGIN')
  try {
    await semer(bd)
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  }
}

// Les comptes d'essai rejoignent la MFR de démonstration (id(3)) et sa classe (id(9)).
const ESSAI = [
  ['essai+admin-etablissement@raai-designer.com', 'admin_etablissement'],
  ['essai+responsable@raai-designer.com', 'responsable_pedagogique'],
  ['essai+enseignant@raai-designer.com', 'enseignant'],
  ['essai+parent@raai-designer.com', 'parent'],
]
let rattaches = 0
for (const [email, role] of ESSAI) {
  const compte = (await client.query(`SELECT id FROM raai_apprendre.compte WHERE email = $1`, [email])).rows[0]
  if (!compte) continue
  const membre = (
    await client.query(
      `INSERT INTO raai_apprendre.membre (id, compte_id, etablissement_id, role)
       VALUES ($1,$2,$3,$4::raai_apprendre.role)
       ON CONFLICT (compte_id, role, etablissement_id, academie_id) DO UPDATE SET expire_le = NULL
       RETURNING id`,
      [randomUUID(), compte.id, id(3), role],
    )
  ).rows[0]
  if (role === 'enseignant') {
    await client.query(
      `INSERT INTO raai_apprendre.affectation (id, membre_id, classe_id)
       SELECT $1, $2, $3 WHERE NOT EXISTS (SELECT 1 FROM raai_apprendre.affectation WHERE membre_id = $2 AND classe_id = $3)`,
      [randomUUID(), membre.id, id(9)],
    )
  }
  rattaches++
}
console.log(`${rattaches} comptes d'essai rattachés à la MFR Escatalens (classe TAE 2026 pour l'enseignant).`)
await client.end()
