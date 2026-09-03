#!/usr/bin/env node
/**
 * Sème le référentiel complet du Bac Pro Agroéquipement 2024 — 10 capacités
 * de rang 1, 22 de rang 2, leurs savoirs mobilisés — depuis
 * `docs/referentiel/bacpro-agroequipement-2024.json`.
 *
 *   node outils/semer-referentiel.mjs .env.vercel.local
 *
 * Complète le jeu de démonstration, qui ne semait que C5 à C9 sans rang 2 :
 * les cinq lignes existantes sont CONSERVÉES (les leçons y sont rattachées),
 * seuls leur intitulé et leur ordre sont réalignés. Tout le reste est
 * inséré avec des identifiants dérivés du code. Idempotent.
 *
 * Le fichier porte son avertissement : transcrit du PDF officiel, non validé
 * par un enseignant d'agroéquipement. Le semer n'est pas le valider.
 */
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'

const env = dotenv.parse(readFileSync(process.argv[2] ?? '.env.local'))
const url = env.DIRECT_URL ?? env.DATABASE_URL
if (!url) {
  console.error('Ni DIRECT_URL ni DATABASE_URL dans le fichier.')
  process.exit(1)
}
const referentiel = JSON.parse(
  readFileSync(fileURLToPath(new URL('../docs/referentiel/bacpro-agroequipement-2024.json', import.meta.url)), 'utf8'),
)

const VERSION = '00000000-0000-4000-8000-000000000006'
const idStable = (...parties) => {
  const h = createHash('sha256').update(parties.join('|')).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } })
await client.connect()
const q = async (sql, params = []) => (await client.query(sql, params)).rows

if (!(await q(`SELECT 1 FROM raai_apprendre_ref.version_referentiel WHERE id = $1`, [VERSION])).length) {
  console.error('La version de référentiel du jeu de démonstration est absente : semer la démonstration d’abord.')
  process.exit(1)
}

await client.query('BEGIN')
try {
  const existantes = new Map(
    (await q(`SELECT id, code FROM raai_apprendre_ref.competence WHERE version_id = $1`, [VERSION])).map((c) => [c.code, c.id]),
  )
  let rang1 = 0
  let rang2 = 0
  let savoirs = 0
  for (const [ordreBloc, bloc] of referentiel.blocs.entries()) {
    const parentId = existantes.get(bloc.capacite) ?? idStable('referentiel-2024', bloc.capacite)
    await q(
      `INSERT INTO raai_apprendre_ref.competence (id, version_id, code, code_bloc, intitule, parent_id, ordre, adaptable_localement)
       VALUES ($1, $2, $3, $4, $5, NULL, $6, $7)
       ON CONFLICT (id) DO UPDATE SET intitule = EXCLUDED.intitule, code_bloc = EXCLUDED.code_bloc,
         ordre = EXCLUDED.ordre, adaptable_localement = EXCLUDED.adaptable_localement`,
      [parentId, VERSION, bloc.capacite, bloc.code, bloc.libelle, ordreBloc + 1, bloc.adaptableLocalement === true],
    )
    rang1++
    for (const [ordre, capacite] of bloc.capacites.entries()) {
      // C10 n'a pas de rang 2 : sa seule « capacité » porte le même code que le bloc.
      if (capacite.code === bloc.capacite) {
        await semerSavoirs(parentId, capacite)
        continue
      }
      const id = existantes.get(capacite.code) ?? idStable('referentiel-2024', capacite.code)
      await q(
        `INSERT INTO raai_apprendre_ref.competence (id, version_id, code, code_bloc, intitule, parent_id, ordre, adaptable_localement)
         VALUES ($1, $2, $3, $4, $5, $6, $7, false)
         ON CONFLICT (id) DO UPDATE SET intitule = EXCLUDED.intitule, code_bloc = EXCLUDED.code_bloc,
           parent_id = EXCLUDED.parent_id, ordre = EXCLUDED.ordre`,
        [id, VERSION, capacite.code, bloc.code, capacite.libelle, parentId, ordre + 1],
      )
      rang2++
      await semerSavoirs(id, capacite)
    }
  }

  async function semerSavoirs(competenceId, capacite) {
    await q(`DELETE FROM raai_apprendre_ref.savoir WHERE competence_id = $1`, [competenceId])
    for (const [ordre, intitule] of (capacite.savoirs ?? []).entries()) {
      await q(
        `INSERT INTO raai_apprendre_ref.savoir (id, competence_id, intitule, ordre) VALUES ($1, $2, $3, $4)`,
        [idStable('referentiel-2024-savoir', capacite.code, String(ordre)), competenceId, intitule, ordre + 1],
      )
      savoirs++
    }
  }

  await client.query('COMMIT')
  console.log(`Référentiel semé : ${rang1} capacités de rang 1, ${rang2} de rang 2, ${savoirs} savoirs mobilisés.`)
} catch (e) {
  await client.query('ROLLBACK')
  throw e
} finally {
  await client.end()
}
