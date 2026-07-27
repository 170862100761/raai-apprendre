/**
 * Base de test pour les permissions.
 *
 * PGlite, pas Docker : les tests de permissions sont bloquants en CI et doivent
 * tourner partout, y compris sur un poste sans conteneur. Un test bloquant qui
 * demande une infrastructure finit désactivé « en attendant » — et ce qui
 * protège le cloisonnement entre établissements ne peut pas être désactivé.
 *
 * PGlite est du vrai PostgreSQL compilé en WASM : RLS, rôles, SECURITY DEFINER
 * et déclencheurs s'y comportent comme en production.
 */
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const MIGRATIONS = join(process.cwd(), 'prisma', 'migrations')

/** Rôles PostgreSQL que Supabase fournit et que nos politiques supposent. */
const PRELUDE = `
  CREATE SCHEMA IF NOT EXISTS extensions;
  CREATE SCHEMA IF NOT EXISTS auth;

  DO $$ BEGIN
    CREATE ROLE anon NOLOGIN NOINHERIT;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
  DO $$ BEGIN
    CREATE ROLE authenticated NOLOGIN NOINHERIT;
  EXCEPTION WHEN duplicate_object THEN NULL; END $$;

  -- Reproduit auth.uid() de Supabase : lit la revendication « sub » du JWT.
  CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
    SELECT NULLIF(current_setting('request.jwt.claims', true)::jsonb ->> 'sub', '')::uuid;
  $$;
`

/**
 * Les migrations ne créent pas les GRANT de table : sur Supabase, PostgREST les
 * reçoit par défaut. On les reproduit pour que la RLS soit ce qui filtre — un
 * test qui passe faute de GRANT ne prouverait rien.
 */
const GRANTS = `
  GRANT USAGE ON SCHEMA raai_apprendre, raai_apprendre_ref TO anon, authenticated;
  GRANT SELECT, INSERT, UPDATE, DELETE
    ON ALL TABLES IN SCHEMA raai_apprendre, raai_apprendre_ref
    TO anon, authenticated;
`

export type Sujet =
  | { type: 'anonyme' }
  | { type: 'compte'; compteId: string }
  | { type: 'apprenant'; jeton: string }

export class BaseDeTest {
  private constructor(private readonly pg: PGlite) {}

  static async demarrer(): Promise<BaseDeTest> {
    const pg = new PGlite()
    await pg.exec(PRELUDE)

    for (const dossier of readdirSync(MIGRATIONS).sort()) {
      const sql = readFileSync(join(MIGRATIONS, dossier, 'migration.sql'), 'utf8')
      await pg.exec(sql)
    }
    await pg.exec(GRANTS)

    return new BaseDeTest(pg)
  }

  /** Exécution privilégiée : préparation du jeu de données uniquement. */
  async prepare(sql: string, params: unknown[] = []) {
    return this.pg.query(sql, params)
  }

  /**
   * Exécution SOUS L'IDENTITÉ d'un sujet, RLS active.
   * C'est la seule voie par laquelle les tests interrogent les données.
   */
  async en<T = Record<string, unknown>>(
    sujet: Sujet,
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const revendications =
      sujet.type === 'compte'
        ? JSON.stringify({ sub: sujet.compteId })
        : sujet.type === 'apprenant'
          ? JSON.stringify({ jeton_apprenant: sujet.jeton })
          : JSON.stringify({})

    await this.pg.exec('BEGIN')
    try {
      await this.pg.query('SELECT set_config($1, $2, true)', [
        'request.jwt.claims',
        revendications,
      ])
      await this.pg.exec(`SET LOCAL ROLE ${sujet.type === 'anonyme' ? 'anon' : 'authenticated'}`)
      const resultat = await this.pg.query<T>(sql, params)
      await this.pg.exec('ROLLBACK')
      return resultat.rows
    } catch (erreur) {
      await this.pg.exec('ROLLBACK')
      throw erreur
    }
  }

  /** Vrai si l'opération est refusée — par la RLS ou par un déclencheur. */
  async refuse(sujet: Sujet, sql: string, params: unknown[] = []): Promise<boolean> {
    try {
      await this.en(sujet, sql, params)
      return false
    } catch {
      return true
    }
  }

  async arreter() {
    await this.pg.close()
  }
}
