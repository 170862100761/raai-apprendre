/**
 * Catalogue, contre une vraie base.
 *
 * Exige `npm run bd:locale`, et `npm run dev` arrêté (PGlite ne sert qu'une
 * connexion). Ignoré si la base est absente.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '@prisma/client'
import { identifiant, type IdentifiantApprenant, type IdentifiantLecon } from '@/noyau/identifiants'
import {
  chargerParcours,
  creerLecon,
  depotCataloguePrisma,
  enregistrerLecon,
  enregistrerLecture,
  publierLecon,
} from '@/domaines/catalogue'
import { identifiant as marquer } from '@/noyau/identifiants'
import type { IdentifiantCompetence } from '@/noyau/identifiants'

const URL_TEST =
  process.env.DATABASE_URL_TEST ??
  // `connection_limit=1` : PGlite ne sert qu'une connexion à la fois, et le
  // pool par défaut de Prisma en ouvre plusieurs. En revanche PAS
  // `pgbouncer=true` ici : ce mode casse le protocole du serveur PGlite
  // (« unexpected message from server ») alors qu'il est nécessaire côté
  // application. Constaté, pas supposé.
  'postgresql://postgres:postgres@127.0.0.1:5433/postgres' +
    '?schema=raai_apprendre&connection_limit=1'

const LECON_HYDRAULIQUE = identifiant<IdentifiantLecon>('00000000-0000-4000-8000-000000000204')
const LECON_SECURITE = identifiant<IdentifiantLecon>('00000000-0000-4000-8000-000000000205')
const THOMAS = identifiant<IdentifiantApprenant>('00000000-0000-4000-8000-000000000042')
const ETABLISSEMENT = '00000000-0000-4000-8000-000000000003'
const CHAPITRE = '00000000-0000-4000-8000-000000000202'
const COMPETENCE_C9 = '00000000-0000-4000-8000-000000000024'

let prisma: PrismaClient
let depot: ReturnType<typeof depotCataloguePrisma>
let disponible = false

beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: URL_TEST } } })
  try {
    const lecon = await prisma.lecon.findUnique({ where: { id: LECON_HYDRAULIQUE } })
    disponible = lecon !== null
  } catch {
    return
  }
  depot = depotCataloguePrisma(prisma)
}, 60_000)

afterAll(async () => {
  if (disponible) {
    await prisma.blocContenu.deleteMany({ where: { id: BLOC_CORROMPU } })
    await prisma.lectureLecon.deleteMany({ where: { apprenantId: THOMAS } })
  }
  await prisma?.$disconnect()
})

const BLOC_CORROMPU = '00000000-0000-4000-8000-000000000999'

describe('chargement d’une leçon', () => {
  it('restitue les blocs dans l’ordre, avec leur contenu typé', async () => {
    if (!disponible) return

    const lecon = await depot.chargerLecon(LECON_HYDRAULIQUE)
    expect(lecon).not.toBeNull()
    expect(lecon!.titre).toBe('Débit, pression et puissance hydraulique')
    expect(lecon!.matiere).toBe('Agroéquipement')
    expect(lecon!.blocs.map((b) => b.contenu.type)).toEqual([
      'texte',
      'lien',
      'bibliographie',
    ])
  })

  it('rattache la leçon à sa compétence du référentiel', async () => {
    if (!disponible) return
    const lecon = await depot.chargerLecon(LECON_HYDRAULIQUE)
    expect(lecon!.competences).toHaveLength(1)
  })

  it('écarte un bloc dont le contenu ne se valide pas, au lieu de le rendre', async () => {
    if (!disponible) return

    // Le cas réel : un import raté, une migration, une écriture manuelle.
    // Rendre au jugé reviendrait à faire confiance à la base pour ce qui
    // s'affichera chez un élève.
    await prisma.blocContenu.create({
      data: {
        id: BLOC_CORROMPU,
        leconId: LECON_HYDRAULIQUE,
        type: 'texte',
        contenu: { type: 'lien', url: 'javascript:alert(1)', titre: 'Piège' },
        ordre: 99,
      },
    })

    const lecon = await depot.chargerLecon(LECON_HYDRAULIQUE)
    expect(lecon!.blocs).toHaveLength(3)
    expect(lecon!.blocs.some((b) => b.id === BLOC_CORROMPU)).toBe(false)
  })

  it('renvoie null pour une leçon inexistante', async () => {
    if (!disponible) return
    const absente = identifiant<IdentifiantLecon>('11111111-1111-4111-8111-111111111111')
    expect(await depot.chargerLecon(absente)).toBeNull()
  })
})

describe('parcours d’un apprenant', () => {
  it('propose la première leçon à un élève qui n’a rien commencé', async () => {
    if (!disponible) return

    const parcours = await chargerParcours(THOMAS, depot)
    expect(parcours.lecons).toHaveLength(2)
    expect(parcours.terminees).toBe(0)
    // Ordre du programme : module puis chapitre. L'hydraulique vient d'abord.
    expect(parcours.prochaine?.id).toBe(LECON_HYDRAULIQUE)
  })

  it('passe à la suivante une fois la première terminée', async () => {
    if (!disponible) return

    await enregistrerLecture(prisma, THOMAS, LECON_HYDRAULIQUE, ETABLISSEMENT, 3, true)

    const parcours = await chargerParcours(THOMAS, depot)
    expect(parcours.terminees).toBe(1)
    expect(parcours.prochaine?.id).toBe(LECON_SECURITE)
  })

  it('ne propose plus rien quand tout est terminé', async () => {
    if (!disponible) return

    await enregistrerLecture(prisma, THOMAS, LECON_SECURITE, ETABLISSEMENT, 1, true)

    const parcours = await chargerParcours(THOMAS, depot)
    expect(parcours.terminees).toBe(2)
    expect(parcours.prochaine).toBeNull()
  })

  it('une leçon terminée ne se « dé-termine » pas quand on la relit', async () => {
    if (!disponible) return

    // Relire depuis le début : ni la position ni l'achèvement ne doivent
    // reculer.
    await enregistrerLecture(prisma, THOMAS, LECON_HYDRAULIQUE, ETABLISSEMENT, 0, false)

    const lecture = await prisma.lectureLecon.findUnique({
      where: { apprenantId_leconId: { apprenantId: THOMAS, leconId: LECON_HYDRAULIQUE } },
    })
    expect(lecture?.termineeLe).not.toBeNull()
    expect(lecture?.position).toBe(3)
  })
})


describe('édition et publication par un enseignant', () => {
  let creeeId: string | null = null

  afterAll(async () => {
    if (creeeId) await prisma.lecon.deleteMany({ where: { id: creeeId } })
  })

  it('refuse de créer une leçon sans compétence rattachée', async () => {
    if (!disponible) return

    // Le refus qui protège tout le suivi : une leçon non rattachée ne compte
    // dans la progression d'aucun élève.
    const r = await creerLecon(
      { chapitreId: CHAPITRE, etablissementId: ETABLISSEMENT, titre: 'Essai', competences: [] },
      depot,
    )
    expect(r.ok).toBe(false)
  })

  it('crée une leçon en brouillon, invisible des élèves', async () => {
    if (!disponible) return

    const r = await creerLecon(
      {
        chapitreId: CHAPITRE,
        etablissementId: ETABLISSEMENT,
        titre: 'Entretien du cardan',
        competences: [marquer<IdentifiantCompetence>(COMPETENCE_C9)],
      },
      depot,
    )
    expect(r.ok).toBe(true)
    if (!r.ok) return
    creeeId = r.valeur.leconId

    const parcours = await chargerParcours(THOMAS, depot)
    expect(parcours.lecons.map((l) => l.id)).not.toContain(creeeId)
  })

  it('refuse de publier une leçon vide', async () => {
    if (!disponible) return
    const r = await publierLecon(identifiant<IdentifiantLecon>(creeeId!), depot)
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erreur.message).toMatch(/vide/)
  })

  it('écarte les blocs invalides à l’enregistrement, garde les bons', async () => {
    if (!disponible) return

    const r = await enregistrerLecon(
      {
        leconId: identifiant<IdentifiantLecon>(creeeId!),
        titre: 'Entretien du cardan',
        competences: [marquer<IdentifiantCompetence>(COMPETENCE_C9)],
        blocs: [
          { type: 'texte', texte: 'Le protecteur de cardan se vérifie avant chaque usage.' },
          { type: 'lien', url: 'javascript:alert(1)', titre: 'Piège' },
          { type: 'inconnu' },
        ],
      },
      depot,
    )

    expect(r.ok).toBe(true)
    expect(r.ok && r.valeur.blocsRetenus).toBe(1)
    expect(r.ok && r.valeur.blocsRefuses).toBe(2)
  })

  it('publie, calcule la durée, et la leçon apparaît chez l’élève', async () => {
    if (!disponible) return

    const r = await publierLecon(identifiant<IdentifiantLecon>(creeeId!), depot)
    expect(r.ok).toBe(true)
    // La durée est calculée, jamais saisie : un enseignant la sous-estimerait.
    expect(r.ok && r.valeur.dureeEstimeeMin).toBeGreaterThanOrEqual(1)

    const parcours = await chargerParcours(THOMAS, depot)
    expect(parcours.lecons.map((l) => l.id)).toContain(creeeId)
  })

  it('modifier une leçon publiée la repasse en brouillon, sur une version neuve', async () => {
    if (!disponible) return

    const avant = await depot.chargerLecon(identifiant<IdentifiantLecon>(creeeId!))

    await enregistrerLecon(
      {
        leconId: identifiant<IdentifiantLecon>(creeeId!),
        titre: 'Entretien du cardan (révisé)',
        competences: [marquer<IdentifiantCompetence>(COMPETENCE_C9)],
        blocs: [{ type: 'texte', texte: 'Texte revu après retour des élèves.' }],
      },
      depot,
    )

    const apres = await depot.chargerLecon(identifiant<IdentifiantLecon>(creeeId!))
    // Un élève en train de lire ne doit pas voir l'énoncé changer sous ses yeux.
    expect(apres!.statut).toBe('brouillon')
    expect(apres!.version).toBe(avant!.version + 1)
    expect(apres!.titre).toBe('Entretien du cardan (révisé)')
  })
})
