/**
 * Les deux droits RGPD, contre une vraie base.
 *
 * Le domaine sait déjà refuser un dossier qui contient un tiers ; ce qu'il ne
 * peut pas savoir, c'est si la requête d'assemblage ramène effectivement les
 * camarades. C'est exactement ce que ce fichier vérifie.
 *
 * Exige `npm run bd:locale`, `npm run dev` arrêté.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantApprenant, IdentifiantEtablissement } from '@/noyau/identifiants'
import {
  depotOrganisationPrisma,
  effacerApprenant,
  exporterDossier,
  MENTION_ANONYME,
} from '@/domaines/organisation'

const URL_TEST =
  process.env.DATABASE_URL_TEST ??
  'postgresql://postgres:postgres@127.0.0.1:5433/postgres' +
    '?schema=raai_apprendre&connection_limit=1&pgbouncer=true'

const ETABLISSEMENT = identifiant<IdentifiantEtablissement>(
  '00000000-0000-4000-8000-000000000003',
)
const LEA = identifiant<IdentifiantApprenant>('00000000-0000-4000-8000-000000000040')

/**
 * Un élève créé POUR ce fichier, et détruit avec lui.
 *
 * Première version : on anonymisait Inès, qui est semée. Le fichier redevenait
 * rejouable, mais `suivi-classe` la comptait ensuite comme absente de sa
 * classe — un test qui casse un autre test parce qu'ils partagent un jeu de
 * données. L'effacement est irréversible par nature : il lui faut un cobaye à
 * lui.
 */
const COBAYE = identifiant<IdentifiantApprenant>('00000000-0000-4000-8000-0000000009f0')
const IDENT_COBAYE = 'test.rgpd.efface'

let prisma: PrismaClient
let depot: ReturnType<typeof depotOrganisationPrisma>
let disponible = false

beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: URL_TEST } } })
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    return
  }

  if ((await prisma.apprenant.findUnique({ where: { id: LEA } })) === null) {
    throw new Error(
      'Base joignable mais jeu de démonstration absent. Relancer `npm run bd:locale`.',
    )
  }

  disponible = true
  depot = depotOrganisationPrisma(prisma)

  // Créé ici, détruit en fin de fichier — et recréé même si l'exécution
  // précédente s'est interrompue avant d'avoir nettoyé.
  await prisma.apprenant.deleteMany({ where: { id: COBAYE } })
  await prisma.apprenant.create({
    data: {
      id: COBAYE,
      etablissementId: ETABLISSEMENT,
      prenom: 'Camille',
      initialeNom: 'R',
      identifiant: IDENT_COBAYE,
      codeHash: '$2b$10$fixtureFixtureFixtureFixtureFixtureFixtureFi',
    },
  })
}, 60_000)

afterAll(async () => {
  if (disponible) {
    // Suppression franche : ce cobaye n'appartient à aucune classe et aucune
    // statistique ne s'appuie dessus. La règle « anonymiser, pas supprimer »
    // protège les données réelles, pas un décor de test.
    await prisma.apprenant.deleteMany({ where: { id: COBAYE } })
  }
  await prisma?.$disconnect()
})

describe('portabilité — remettre son dossier à un élève', () => {
  it('assemble un dossier daté et versionné', async () => {
    if (!disponible) return

    const r = await exporterDossier(LEA, ETABLISSEMENT, depot)
    expect(r.ok).toBe(true)
    if (!r.ok) return

    expect(r.valeur.version).toBe(1)
    expect(r.valeur.eleve.prenom).toBe('Léa')
    expect(r.valeur.etablissement).toContain('Escatalens')
    expect(r.valeur.acquis.length).toBeGreaterThan(0)
  })

  it('ne fait fuiter AUCUN camarade', async () => {
    if (!disponible) return

    // Le défaut classique d'un export RGPD : exporter « la classe » au lieu de
    // « l'élève ». Léa, Thomas et Inès sont dans la même classe.
    const r = await exporterDossier(LEA, ETABLISSEMENT, depot)
    expect(r.ok).toBe(true)
    if (!r.ok) return

    const serialise = JSON.stringify(r.valeur)
    expect(serialise).not.toContain('Thomas')
    expect(serialise).not.toContain('Inès')
    expect(serialise).not.toContain('thomas.escatalens')
  })

  it('ne contient aucun secret d’authentification', async () => {
    if (!disponible) return

    const r = await exporterDossier(LEA, ETABLISSEMENT, depot)
    if (!r.ok) return

    // Le code est haché, mais un hachage bcrypt reste un secret : le remettre
    // permettrait de l'attaquer hors ligne, sur quatre chiffres.
    const serialise = JSON.stringify(r.valeur)
    expect(serialise).not.toContain('$2b$')
    expect(serialise).not.toContain('codeHash')
  })

  it('refuse un élève d’un autre établissement', async () => {
    if (!disponible) return

    const etranger = identifiant<IdentifiantEtablissement>(
      '11111111-1111-4111-8111-111111111111',
    )
    const r = await exporterDossier(LEA, etranger, depot)
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.erreur.code).toBe('introuvable')
  })
})

describe('effacement — anonymisation, pas suppression', () => {
  it('efface ce qui identifie et garde ce qui compte', async () => {
    if (!disponible) return

    const acquisAvant = await prisma.acquisCompetence.count({ where: { apprenantId: COBAYE } })
    const lecturesAvant = await prisma.lectureLecon.count({ where: { apprenantId: COBAYE } })

    const r = await effacerApprenant(COBAYE, ETABLISSEMENT, depot)
    expect(r.ok).toBe(true)

    const apres = await prisma.apprenant.findUnique({ where: { id: COBAYE } })
    expect(apres?.prenom).toBe(MENTION_ANONYME)
    expect(apres?.identifiant).toBeNull()
    expect(apres?.codeHash).toBeNull()
    expect(apres?.actif).toBe(false)

    // La règle du document 09 §5 : les statistiques agrégées survivent.
    // Supprimer les lignes ferait mentir la couverture du référentiel de la
    // classe, des mois plus tard.
    expect(await prisma.acquisCompetence.count({ where: { apprenantId: COBAYE } })).toBe(
      acquisAvant,
    )
    expect(await prisma.lectureLecon.count({ where: { apprenantId: COBAYE } })).toBe(
      lecturesAvant,
    )
    expect(await prisma.apprenant.count({ where: { id: COBAYE } })).toBe(1)
  })

  it('ne laisse plus rien à exporter', async () => {
    if (!disponible) return

    const r = await exporterDossier(COBAYE, ETABLISSEMENT, depot)
    expect(r.ok).toBe(true)
    if (!r.ok) return

    // Le dossier existe encore — l'élève n'est pas supprimé — mais il ne
    // désigne plus personne.
    expect(r.valeur.eleve.prenom).toBe(MENTION_ANONYME)
    expect(r.valeur.eleve.identifiant).toBeNull()
  })

  it('refuse un élève d’un autre établissement', async () => {
    if (!disponible) return

    const etranger = identifiant<IdentifiantEtablissement>(
      '11111111-1111-4111-8111-111111111111',
    )
    const r = await effacerApprenant(LEA, etranger, depot)
    expect(r.ok).toBe(false)

    // Et surtout : Léa n'a pas été touchée au passage.
    const lea = await prisma.apprenant.findUnique({ where: { id: LEA } })
    expect(lea?.prenom).toBe('Léa')
  })
})
