/**
 * Parcours de connexion élève, contre une vraie base.
 *
 * Les tests de `src/domaines` couvrent les décisions avec des ports doublés.
 * Celui-ci couvre ce qu'un double ne peut pas prouver : que l'adaptateur
 * Prisma traduit correctement, que bcrypt réel fonctionne, et que le jeton
 * émis est relisible.
 *
 * Il exige la base locale :  npm run bd:locale
 * Sans elle, les tests sont ignorés — pas rouges. Une CI ne doit pas échouer
 * parce qu'un service optionnel n'est pas lancé.
 *
 * ATTENTION : PGlite ne sert qu'une connexion à la fois. Arrêter `npm run dev`
 * avant de lancer ces tests, sinon le serveur de développement monopolise la
 * connexion et les tests échouent sur « Can't reach database server ».
 * La production, sur Supabase, n'a évidemment pas cette limite.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
import { identifiant, type JetonSession } from '@/noyau/identifiants'
import {
  depotIdentitePrisma,
  hachageBcrypt,
  HORLOGE_SYSTEME,
  ouvrirSessionApprenant,
  resoudreSession,
  ESSAIS_AVANT_VERROU,
} from '@/domaines/identite'

const URL_TEST =
  process.env.DATABASE_URL_TEST ??
  // `connection_limit=1` : PGlite ne sert qu'une connexion à la fois, et le
  // pool par défaut de Prisma en ouvre plusieurs. En revanche PAS
  // `pgbouncer=true` ici : ce mode casse le protocole du serveur PGlite
  // (« unexpected message from server ») alors qu'il est nécessaire côté
  // application. Constaté, pas supposé.
  'postgresql://postgres:postgres@127.0.0.1:5433/postgres' +
    '?schema=raai_apprendre&connection_limit=1'

let prisma: PrismaClient
let disponible = false
let depot: ReturnType<typeof depotIdentitePrisma>

const IDENT = 'test.connexion'
const CODE = '7412'

beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: URL_TEST } } })
  try {
    await prisma.$queryRaw`SELECT 1`
    disponible = true
  } catch {
    return
  }

  depot = depotIdentitePrisma(prisma)

  const etablissement = await prisma.etablissement.findFirst({ select: { id: true } })
  if (!etablissement) {
    disponible = false
    return
  }

  await prisma.apprenant.deleteMany({ where: { identifiant: IDENT } })
  await prisma.verrouAcces.deleteMany({ where: { identifiant: IDENT } })
  await prisma.apprenant.create({
    data: {
      etablissementId: etablissement.id,
      prenom: 'Camille',
      initialeNom: 'R',
      identifiant: IDENT,
      codeHash: await bcrypt.hash(CODE, 10),
    },
  })
}, 60_000)

afterAll(async () => {
  if (disponible) {
    await prisma.apprenant.deleteMany({ where: { identifiant: IDENT } })
    await prisma.verrouAcces.deleteMany({ where: { identifiant: IDENT } })
  }
  await prisma?.$disconnect()
})

const ouvrir = (code: string, id = IDENT) =>
  ouvrirSessionApprenant(
    { identifiant: id, code },
    { depot, hachage: hachageBcrypt, horloge: HORLOGE_SYSTEME },
  )

describe('connexion élève de bout en bout', () => {
  it('ouvre une session, puis la relit', async () => {
    if (!disponible) return

    const ouverture = await ouvrir(CODE)
    expect(ouverture.ok).toBe(true)
    if (!ouverture.ok) return

    // Le jeton doit être relisible : c'est tout l'enjeu du parcours.
    const session = await resoudreSession({ jetonApprenant: ouverture.valeur.jeton }, depot)
    expect(session.sujetId).not.toBeNull()
    expect(session.origine).toBe('jeton_apprenant')
    expect(session.attributions).toEqual([{ role: 'apprenant', portee: { type: 'soi' } }])
    expect(session.etablissementId).not.toBeNull()
  })

  it('refuse un mauvais code, avec bcrypt réel', async () => {
    if (!disponible) return
    const r = await ouvrir('0000')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erreur.message).toBe('Identifiant ou code incorrect.')
  })

  it("un jeton révoqué ne rouvre pas de session", async () => {
    if (!disponible) return

    const ouverture = await ouvrir(CODE)
    if (!ouverture.ok) throw new Error('ouverture attendue')

    const apprenant = await prisma.apprenant.findUnique({
      where: { identifiant: IDENT },
      select: { id: true },
    })
    // Le formateur révoque en un clic : l'effet doit être immédiat.
    await depot.revoquerSessionsApprenant(identifiant(apprenant!.id))

    const session = await resoudreSession({ jetonApprenant: ouverture.valeur.jeton }, depot)
    expect(session.sujetId).toBeNull()
  })

  it("un jeton inventé ne donne rien", async () => {
    if (!disponible) return
    const session = await resoudreSession(
      { jetonApprenant: identifiant<JetonSession>('11111111-1111-4111-8111-111111111111') },
      depot,
    )
    expect(session.sujetId).toBeNull()
  })

  it('le verrou est bien persisté entre deux appels', async () => {
    if (!disponible) return

    await prisma.verrouAcces.deleteMany({ where: { identifiant: IDENT } })
    for (let i = 0; i < ESSAIS_AVANT_VERROU; i++) await ouvrir('0000')

    const r = await ouvrir(CODE)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erreur.code).toBe('compte_verrouille')

    const verrou = await prisma.verrouAcces.findUnique({ where: { identifiant: IDENT } })
    expect(verrou?.echecs).toBeGreaterThanOrEqual(ESSAIS_AVANT_VERROU)
    expect(verrou?.verrouilleJusqua).not.toBeNull()
  })

  it("un identifiant inconnu ne crée pas d'apprenant fantôme", async () => {
    if (!disponible) return
    const avant = await prisma.apprenant.count()
    await ouvrir(CODE, 'personne.qui.nexiste.pas')
    expect(await prisma.apprenant.count()).toBe(avant)
  })
})
