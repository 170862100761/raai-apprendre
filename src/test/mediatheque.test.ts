/**
 * Médiathèque, avec le VRAI stockage disque et la VRAIE base.
 *
 * Les tests à doubles couvrent les décisions ; celui-ci couvre ce qu'un double
 * ne peut pas prouver : que le fichier atterrit sur le disque, que la ligne
 * correspond, et qu'on le relit tel quel.
 *
 * Exige `npm run bd:locale`, `npm run dev` arrêté.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { randomUUID } from 'node:crypto'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantEtablissement } from '@/noyau/identifiants'
import {
  depotMediathequePrisma,
  servirMedia,
  stockageDisque,
  televerser,
  TYPES_ACCEPTES,
} from '@/domaines/mediatheque'

const URL_TEST =
  process.env.DATABASE_URL_TEST ??
  'postgresql://postgres:postgres@127.0.0.1:5433/postgres' +
    '?schema=raai_apprendre&connection_limit=1'

const ETABLISSEMENT = identifiant<IdentifiantEtablissement>(
  '00000000-0000-4000-8000-000000000003',
)

let prisma: PrismaClient
let depot: ReturnType<typeof depotMediathequePrisma>
let disponible = false
const creees: string[] = []

const PNG = () => {
  const contenu = new Uint8Array(1024)
  contenu.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  // Une charge reconnaissable, pour vérifier qu'on relit bien le même octet.
  contenu[512] = 0x42
  return contenu
}

const affichable = (mime: string) =>
  TYPES_ACCEPTES.find((t) => t.mime === mime)?.affichable ?? false

beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: URL_TEST } } })
  try {
    const etablissement = await prisma.etablissement.findUnique({
      where: { id: ETABLISSEMENT },
    })
    disponible = etablissement !== null
  } catch {
    return
  }
  depot = depotMediathequePrisma(prisma)
}, 60_000)

afterAll(async () => {
  if (disponible) {
    for (const id of creees) {
      const ressource = await prisma.ressource.findUnique({ where: { id } })
      if (ressource) {
        await rm(join(process.cwd(), 'outils', 'medias-locaux', ressource.cheminStockage), {
          force: true,
        })
      }
    }
    await prisma.ressource.deleteMany({ where: { id: { in: creees } } })
  }
  await prisma?.$disconnect()
})

const deposer = (nom: string, contenu = PNG()) =>
  televerser(
    { etablissementId: ETABLISSEMENT, nom, contenu },
    { depot, stockage: stockageDisque, identifiant: randomUUID },
  )

describe('téléversement réel', () => {
  it('écrit le fichier et crée la ligne', async () => {
    if (!disponible) return

    const r = await deposer('schema hydraulique.png')
    expect(r.ok).toBe(true)
    if (!r.ok) return
    creees.push(r.valeur.ressourceId)

    const ressource = await prisma.ressource.findUnique({
      where: { id: r.valeur.ressourceId },
    })
    expect(ressource?.typeMime).toBe('image/png')
    expect(ressource?.nom).toBe('schema-hydraulique.png')
    expect(Number(ressource?.tailleOctets)).toBe(1024)
    // Le chemin est cloisonné par établissement, ce qui rend une fuite visible
    // à l'œil nu lors d'un audit du stockage.
    expect(ressource?.cheminStockage.startsWith(`${ETABLISSEMENT}/`)).toBe(true)
  })

  it('relit exactement les octets déposés', async () => {
    if (!disponible) return

    const depose = await deposer('relecture.png')
    if (!depose.ok) throw new Error('dépôt attendu')
    creees.push(depose.valeur.ressourceId)

    const r = await servirMedia(
      depose.valeur.ressourceId,
      { depot, stockage: stockageDisque },
      affichable,
    )
    expect(r.ok).toBe(true)
    expect(r.ok && r.valeur.contenu.byteLength).toBe(1024)
    expect(r.ok && r.valeur.contenu[512]).toBe(0x42)
    expect(r.ok && r.valeur.affichable).toBe(true)
  })

  it('ne laisse aucune trace quand le fichier est refusé', async () => {
    if (!disponible) return

    const avant = await prisma.ressource.count()
    const r = await deposer('piege.exe')

    expect(r.ok).toBe(false)
    expect(await prisma.ressource.count()).toBe(avant)
  })

  it('refuse une image dont le contenu dément l’extension', async () => {
    if (!disponible) return

    const html = new TextEncoder().encode('<html><script>alert(1)</script></html>')
    const r = await deposer('schema.png', new Uint8Array(html))
    expect(r.ok).toBe(false)
  })
})
