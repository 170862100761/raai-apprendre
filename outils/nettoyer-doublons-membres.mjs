#!/usr/bin/env node
/**
 * Supprime les lignes `membre` en double (même compte, même rôle, même
 * établissement, même académie), en gardant la plus ancienne et en lui
 * transférant les affectations des autres. Les doublons naissent d'un
 * `ON CONFLICT` sur une contrainte qui ne joue pas quand une colonne est NULL.
 *
 *   node outils/nettoyer-doublons-membres.mjs .env.vercel.local
 */
import { readFileSync } from 'node:fs'
import dotenv from 'dotenv'
import pg from 'pg'

const env = dotenv.parse(readFileSync(process.argv[2] ?? '.env.local'))
const client = new pg.Client({ connectionString: env.DIRECT_URL ?? env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
await client.query('BEGIN')
const { rows: doublons } = await client.query(`
  SELECT m.id, g.garde
  FROM raai_apprendre.membre m
  JOIN (
    SELECT compte_id, role, etablissement_id, academie_id, (array_agg(id ORDER BY cree_le))[1] AS garde
    FROM raai_apprendre.membre
    GROUP BY compte_id, role, etablissement_id, academie_id
    HAVING count(*) > 1
  ) g ON g.compte_id = m.compte_id AND g.role = m.role
     AND g.etablissement_id IS NOT DISTINCT FROM m.etablissement_id
     AND g.academie_id IS NOT DISTINCT FROM m.academie_id
  WHERE m.id <> g.garde`)
for (const d of doublons) {
  await client.query(`UPDATE raai_apprendre.affectation SET membre_id = $1 WHERE membre_id = $2`, [d.garde, d.id])
  await client.query(`DELETE FROM raai_apprendre.membre WHERE id = $1`, [d.id])
}
await client.query('COMMIT')
console.log(`${doublons.length} doublon(s) de membre supprimé(s).`)
await client.end()
