/**
 * Famille 1 — couverture RLS.
 *
 * Une table sans politique est une fuite en attente. C'est sur les tables
 * ajoutées après coup que l'oubli se produit : ce test n'énumère donc rien à la
 * main, il interroge le catalogue.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { BaseDeTest } from './base'

let bd: BaseDeTest

beforeAll(async () => {
  bd = await BaseDeTest.demarrer()
}, 60_000)

afterAll(async () => {
  await bd.arreter()
})

const SCHEMAS = ['raai_apprendre', 'raai_apprendre_ref', 'raai_apprendre_audit']

describe('couverture RLS', () => {
  it('toute table a la RLS activée ET forcée', async () => {
    const lignes = await bd.prepare(
      `SELECT c.relnamespace::regnamespace::text AS schema,
              c.relname                          AS table,
              c.relrowsecurity                   AS activee,
              c.relforcerowsecurity              AS forcee
         FROM pg_class c
        WHERE c.relnamespace::regnamespace::text = ANY($1)
          AND c.relkind = 'r'
          AND c.relname <> '_prisma_migrations'
        ORDER BY 1, 2`,
      [SCHEMAS],
    )

    const tables = lignes.rows as Array<{
      schema: string
      table: string
      activee: boolean
      forcee: boolean
    }>

    expect(tables.length).toBeGreaterThan(25)

    // FORCE compte autant que ENABLE : sans lui, le propriétaire — celui-là
    // même qui exécute les migrations — contourne ses propres politiques.
    const defaillantes = tables
      .filter((t) => !t.activee || !t.forcee)
      .map((t) => `${t.schema}.${t.table}`)

    expect(defaillantes).toEqual([])
  })

  it('toute table a au moins une politique', async () => {
    const lignes = await bd.prepare(
      `SELECT format('%s.%s', c.relnamespace::regnamespace, c.relname) AS nom
         FROM pg_class c
        WHERE c.relnamespace::regnamespace::text = ANY($1)
          AND c.relkind = 'r'
          AND c.relname <> '_prisma_migrations'
          AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid)`,
      [SCHEMAS],
    )

    expect((lignes.rows as Array<{ nom: string }>).map((l) => l.nom)).toEqual([])
  })

  it("le schéma d'audit n'est atteignable par personne", async () => {
    const droits = await bd.prepare(
      `SELECT has_schema_privilege('authenticated', 'raai_apprendre_audit', 'USAGE') AS usage`,
    )
    expect((droits.rows[0] as { usage: boolean }).usage).toBe(false)
  })
})
