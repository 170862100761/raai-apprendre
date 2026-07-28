/**
 * L'audit à travers l'adaptateur Prisma, contre une vraie base.
 *
 * Les tests de `permissions/audit.test.ts` vérifient les propriétés du journal
 * en SQL pur. Celui-ci vérifie ce qu'ils ne peuvent pas : que le chemin
 * applicatif — `tracer` → `journalPrisma` → fonction SECURITY DEFINER —
 * aboutit réellement à une ligne.
 *
 * Exige `npm run bd:locale`, `npm run dev` arrêté.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { journalPrisma, tracer } from '@/domaines/audit'

const URL_TEST =
  process.env.DATABASE_URL_TEST ??
  'postgresql://postgres:postgres@127.0.0.1:5433/postgres' +
    '?schema=raai_apprendre&connection_limit=1'

const ETABLISSEMENT = '00000000-0000-4000-8000-000000000003'
const REQUETE = 'test-audit-integration'

let prisma: PrismaClient
let journal: ReturnType<typeof journalPrisma>
let disponible = false

type Ligne = {
  action: string
  sujet_type: string
  role_effectif: string
  ressource_type: string
  ip_tronquee: string | null
}

const lire = () =>
  prisma.$queryRawUnsafe<Ligne[]>(
    `SELECT action, sujet_type, role_effectif, ressource_type, ip_tronquee
       FROM raai_apprendre_audit.evenement
      WHERE id_requete = '${REQUETE}'
      ORDER BY survenu_le`,
  )

beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: URL_TEST } } })
  try {
    await prisma.$queryRaw`SELECT 1`
    disponible = true
  } catch {
    return
  }
  journal = journalPrisma(prisma)
}, 60_000)

afterAll(async () => {
  await prisma?.$disconnect()
})

describe('écriture depuis le code applicatif', () => {
  it('aboutit à une ligne dans le journal', async () => {
    if (!disponible) return

    await tracer(
      'competence.declaree',
      {
        sujetId: null,
        sujetType: 'compte',
        roleEffectif: 'enseignant',
        etablissementId: ETABLISSEMENT,
        ip: '192.168.1.42',
        idRequete: REQUETE,
      },
      { type: 'acquis_competence', id: null },
      journal,
    )

    const lignes = await lire()
    expect(lignes).toHaveLength(1)
    expect(lignes[0]?.action).toBe('competence.declaree')
    expect(lignes[0]?.role_effectif).toBe('enseignant')
  })

  it("tronque l'adresse avant de l'enregistrer", async () => {
    if (!disponible) return
    const lignes = await lire()
    // Deux barrières : le domaine tronque, la fonction SQL retronque.
    expect(lignes[0]?.ip_tronquee).toBe('192.168.1.0')
  })

  it("n'enregistre aucun contenu — seulement des métadonnées", async () => {
    if (!disponible) return

    const colonnes = await prisma.$queryRawUnsafe<{ column_name: string }[]>(
      `SELECT column_name FROM information_schema.columns
        WHERE table_schema = 'raai_apprendre_audit' AND table_name = 'evenement'`,
    )
    const noms = colonnes.map((c) => c.column_name)

    // Aucune colonne où déverser une valeur : la structure elle-même interdit
    // au journal de devenir une seconde base de données personnelles.
    for (const interdit of ['contenu', 'detail', 'valeur', 'commentaire', 'charge', 'donnees']) {
      expect(noms, interdit).not.toContain(interdit)
    }
  })

  it("une panne du journal ne fait pas échouer l'action auditée", async () => {
    if (!disponible) return

    const casse = journalPrisma(
      new PrismaClient({ datasources: { db: { url: 'postgresql://x:x@127.0.0.1:1/x' } } }),
    )

    // Refuser une connexion parce que le journal est indisponible
    // transformerait une panne d'observabilité en panne de service.
    await expect(
      tracer(
        'connexion.reussie',
        {
          sujetId: null,
          sujetType: 'anonyme',
          roleEffectif: 'aucun',
          etablissementId: null,
          idRequete: 'test-panne',
        },
        { type: 'session' },
        casse,
      ),
    ).resolves.toBeUndefined()
  })
})
