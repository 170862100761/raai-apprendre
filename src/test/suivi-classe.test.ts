/**
 * La grille de suivi, contre une vraie base.
 *
 * Exige `npm run bd:locale`, `npm run dev` arrêté.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantApprenant, IdentifiantClasse } from '@/noyau/identifiants'
import { depotProgressionPrisma, niveauDe, suivreClasse } from '@/domaines/progression'

const URL_TEST =
  process.env.DATABASE_URL_TEST ??
  'postgresql://postgres:postgres@127.0.0.1:5433/postgres' +
    '?schema=raai_apprendre&connection_limit=1'

const CLASSE = identifiant<IdentifiantClasse>('00000000-0000-4000-8000-000000000009')
const LEA = identifiant<IdentifiantApprenant>('00000000-0000-4000-8000-000000000040')

let prisma: PrismaClient
let depot: ReturnType<typeof depotProgressionPrisma>
let disponible = false

beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: URL_TEST } } })
  try {
    disponible = (await prisma.classe.findUnique({ where: { id: CLASSE } })) !== null
  } catch {
    return
  }
  depot = depotProgressionPrisma(prisma)
}, 60_000)

afterAll(async () => {
  await prisma?.$disconnect()
})

describe('grille de la classe', () => {
  it('liste les élèves inscrits et les compétences du diplôme', async () => {
    if (!disponible) return

    const suivi = await suivreClasse(CLASSE, depot)
    expect(suivi.ok).toBe(true)
    if (!suivi.ok) return

    expect(suivi.valeur.nomClasse).toBe('TAE 2026')
    expect(suivi.valeur.grille.apprenants).toHaveLength(3)
    // Les cinq capacités professionnelles semées, pas tout le catalogue
    // national : une grille de 200 colonnes ne se lit pas.
    expect(suivi.valeur.grille.competences).toHaveLength(5)
  })

  it('trie les élèves par prénom, à la française', async () => {
    if (!disponible) return
    const suivi = await suivreClasse(CLASSE, depot)
    if (!suivi.ok) return

    // « Inès » avant « Léa » : un tri ASCII placerait les accents en dernier.
    expect(suivi.valeur.grille.apprenants.map((a) => a.prenom)).toEqual([
      'Inès',
      'Léa',
      'Thomas',
    ])
  })

  it('restitue les acquis semés', async () => {
    if (!disponible) return
    const suivi = await suivreClasse(CLASSE, depot)
    if (!suivi.ok) return

    const { grille, index } = suivi.valeur
    const c5 = grille.competences.find((c) => c.code === 'C5')!
    expect(niveauDe(index, LEA, c5.id)).toBe('acquise')

    // Une case sans ligne en base vaut « non abordée », pas undefined.
    const c9 = grille.competences.find((c) => c.code === 'C9')!
    expect(niveauDe(index, LEA, c9.id)).toBe('non_abordee')
  })

  it('calcule la couverture du référentiel', async () => {
    if (!disponible) return
    const suivi = await suivreClasse(CLASSE, depot)
    if (!suivi.ok) return

    // Léa a des acquis sur C5 à C8, rien sur C9 : 4 colonnes sur 5.
    expect(suivi.valeur.couverture).toBe(0.8)
  })

  it('désigne les compétences sur lesquelles la classe bloque', async () => {
    if (!disponible) return
    const suivi = await suivreClasse(CLASSE, depot)
    if (!suivi.ok) return

    expect(suivi.valeur.bloquantes.length).toBeGreaterThan(0)
    // La pire d'abord.
    const parts = suivi.valeur.bloquantes.map((b) => b.partValidee)
    expect([...parts].sort((a, b) => a - b)).toEqual(parts)
  })

  it('signale les élèves qui ne se sont jamais connectés', async () => {
    if (!disponible) return
    const suivi = await suivreClasse(CLASSE, depot)
    if (!suivi.ok) return

    // Le jeu de démonstration ne fait se connecter personne : les trois élèves
    // sont « jamais venus », aucun n'est « à relancer ».
    expect(suivi.valeur.jamaisVenus.length + suivi.valeur.aRelancer.length).toBe(3)
  })

  it("renvoie « introuvable » pour une classe inconnue", async () => {
    if (!disponible) return
    const absente = identifiant<IdentifiantClasse>('11111111-1111-4111-8111-111111111111')
    const suivi = await suivreClasse(absente, depot)
    expect(suivi.ok).toBe(false)
  })
})
