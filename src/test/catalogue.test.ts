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
  // pool par défaut de Prisma en ouvre plusieurs.
  //
  // `pgbouncer=true` : identique à l'application, et pour la même raison. PGlite
  // conserve les requêtes préparées d'une connexion à la suivante, si bien que
  // la DEUXIÈME exécution des tests contre une même base échouait sur
  // « prepared statement "s0" already exists ». Le garde attrapait l'erreur et
  // s'abstenait : la suite passait au vert sans avoir rien exécuté.
  'postgresql://postgres:postgres@127.0.0.1:5433/postgres' +
    '?schema=raai_apprendre&connection_limit=1&pgbouncer=true'

const LECON_HYDRAULIQUE = identifiant<IdentifiantLecon>('00000000-0000-4000-8000-000000000204')
// Le semoir puise dans la même suite pour les apprenants, leurs inscriptions et
// leurs acquis : les élèves sont 40, 47 et 54, pas 40, 41 et 42. L'ancienne
// valeur (42) désignait une ligne d'acquis de Léa, donc aucun élève.
const THOMAS = identifiant<IdentifiantApprenant>('00000000-0000-4000-8000-000000000047')
const ETABLISSEMENT = '00000000-0000-4000-8000-000000000003'
const CHAPITRE = '00000000-0000-4000-8000-000000000202'
const COMPETENCE_C9 = '00000000-0000-4000-8000-000000000024'

let prisma: PrismaClient
let depot: ReturnType<typeof depotCataloguePrisma>
let disponible = false

beforeAll(async () => {
  prisma = new PrismaClient({ datasources: { db: { url: URL_TEST } } })
  // Base absente : on s'abstient, c'est légitime. Base présente mais jeu de
  // démonstration incomplet : c'est un échec. Les confondre — ce que faisait un
  // `catch` unique autour de la recherche du fixture — rendait ce fichier
  // silencieusement inerte, et neuf de ses assertions fausses sans que rien ne
  // rougisse.
  try {
    await prisma.$queryRaw`SELECT 1`
  } catch {
    return
  }

  if ((await prisma.lecon.findUnique({ where: { id: LECON_HYDRAULIQUE } })) === null) {
    throw new Error(
      'Base joignable mais jeu de démonstration absent. Relancer `npm run bd:locale`.',
    )
  }

  disponible = true
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
    // Les cinq blocs semés, dans l'ordre. L'image et le modèle 3D sont arrivés
    // avec la médiathèque et la visionneuse ; cette attente en était restée à
    // trois, sans que personne ne le voie — la suite ne s'exécutait plus.
    expect(lecon!.blocs.map((b) => b.contenu.type)).toEqual([
      'texte',
      'image',
      'lien',
      'modele3d',
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
    //
    // Comptage AVANT plutôt qu'un nombre écrit en dur : ce que ce test doit
    // prouver, c'est qu'ajouter un bloc invalide ne change rien à ce qui sort,
    // pas que la leçon semée compte tel nombre de blocs. La version précédente
    // attendait 3 et serait retombée en panne au prochain bloc ajouté au jeu.
    const avant = (await depot.chargerLecon(LECON_HYDRAULIQUE))!.blocs.length

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
    expect(lecon!.blocs).toHaveLength(avant)
    expect(lecon!.blocs.some((b) => b.id === BLOC_CORROMPU)).toBe(false)
  })

  it('renvoie null pour une leçon inexistante', async () => {
    if (!disponible) return
    const absente = identifiant<IdentifiantLecon>('11111111-1111-4111-8111-111111111111')
    expect(await depot.chargerLecon(absente)).toBeNull()
  })
})

// Ces tests avançaient dans le parcours de Thomas leçon par leçon, en comptant
// sur un jeu de démonstration à deux leçons. Il en compte dix depuis qu'on peut
// en faire une démonstration, et il en comptera davantage. Ce qu'ils doivent
// vérifier, c'est l'enchaînement — première, suivante, plus rien — pas la
// longueur du programme.
describe('parcours d’un apprenant', () => {
  it('propose la première leçon à un élève qui n’a rien commencé', async () => {
    if (!disponible) return

    const parcours = await chargerParcours(THOMAS, depot)
    expect(parcours.lecons.length).toBeGreaterThan(0)
    expect(parcours.terminees).toBe(0)
    // Ordre du programme : module puis chapitre. L'hydraulique vient d'abord.
    expect(parcours.prochaine?.id).toBe(LECON_HYDRAULIQUE)
  })

  it('passe à la suivante une fois la première terminée', async () => {
    if (!disponible) return

    const avant = await chargerParcours(THOMAS, depot)
    await enregistrerLecture(prisma, THOMAS, LECON_HYDRAULIQUE, ETABLISSEMENT, 3, true)

    const parcours = await chargerParcours(THOMAS, depot)
    expect(parcours.terminees).toBe(1)
    // Elle avance, et elle n'avance pas au hasard : c'est la leçon suivante
    // dans l'ordre du programme.
    expect(parcours.prochaine?.id).not.toBe(LECON_HYDRAULIQUE)
    expect(parcours.prochaine?.id).toBe(avant.lecons[1]?.id)
  })

  it('ne propose plus rien quand tout est terminé', async () => {
    if (!disponible) return

    const parcours = await chargerParcours(THOMAS, depot)
    for (const lecon of parcours.lecons) {
      if (lecon.terminee) continue
      await enregistrerLecture(prisma, THOMAS, lecon.id, ETABLISSEMENT, 1, true)
    }

    const apres = await chargerParcours(THOMAS, depot)
    expect(apres.terminees).toBe(apres.lecons.length)
    expect(apres.prochaine).toBeNull()
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
