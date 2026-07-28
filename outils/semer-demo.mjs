/**
 * Jeu de démonstration : un établissement, une classe, trois élèves.
 *
 * Le référentiel semé est le vrai Bac Pro Agroéquipement rénové (arrêté du
 * 21 mars 2023). Semer un référentiel inventé donnerait une démonstration qui
 * ne ressemble à rien de ce que verront les établissements.
 */
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { deflateSync } from 'node:zlib'

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

/** Extrait du référentiel rénové — les capacités professionnelles B5 à B9. */
const CAPACITES = [
  ['C5', 'B5', 'Choisir un équipement adapté à un contexte en lien avec les transitions'],
  ['C6', 'B6', 'Organiser un chantier en mobilisant des agroéquipements'],
  ['C7', 'B7', 'Adapter les équipements à la conduite d’un chantier'],
  ['C8', 'B8', 'Mettre en œuvre des équipements en sécurité'],
  ['C9', 'B9', 'Réaliser des opérations de maintenance'],
]

const ELEVES = [
  ['Léa', 'M', 'lea.escatalens', '4271'],
  ['Thomas', 'B', 'thomas.escatalens', '8305'],
  ['Inès', 'K', 'ines.escatalens', '6194'],
]

export async function semer(bd) {
  const q = (sql, params = []) => bd.query(sql, params)

  await q(`INSERT INTO raai_apprendre.pays (id, code, nom) VALUES ($1,'FR','France')`, [id(1)])
  await q(
    `INSERT INTO raai_apprendre.academie (id, pays_id, code, nom)
     VALUES ($1,$2,'TOULOUSE','Toulouse')`,
    [id(2), id(1)],
  )
  await q(
    `INSERT INTO raai_apprendre.etablissement (id, academie_id, uai, nom, type, mode_identite)
     VALUES ($1,$2,'0820001A','MFR Escatalens','MFR','minimal')`,
    [id(3), id(2)],
  )

  await q(
    `INSERT INTO raai_apprendre_ref.diplome
       (id, code, intitule, ministere, niveau_europeen, filiere)
     VALUES ($1,'BACPRO-AE','Baccalauréat professionnel Agroéquipement','MASA',4,'agroequipement')`,
    [id(4)],
  )
  await q(
    `INSERT INTO raai_apprendre_ref.niveau (id, diplome_id, code, intitule, ordre)
     VALUES ($1,$2,'TERM','Terminale',3)`,
    [id(5), id(4)],
  )
  await q(
    `INSERT INTO raai_apprendre_ref.version_referentiel
       (id, diplome_id, reference_arrete, entree_en_vigueur, statut)
     VALUES ($1,$2,'Arrêté du 21 mars 2023','2023-09-01','publie')`,
    [id(6), id(4)],
  )

  let n = 20
  const competences = []
  for (const [code, bloc, intitule] of CAPACITES) {
    const cid = id(n++)
    competences.push(cid)
    await q(
      `INSERT INTO raai_apprendre_ref.competence
         (id, version_id, code, code_bloc, intitule, ordre)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [cid, id(6), code, bloc, intitule, competences.length],
    )
  }

  await q(
    `INSERT INTO raai_apprendre.offre_formation (id, etablissement_id, diplome_id)
     VALUES ($1,$2,$3)`,
    [id(7), id(3), id(4)],
  )
  await q(
    `INSERT INTO raai_apprendre.annee_scolaire (id, etablissement_id, libelle, debut, fin)
     VALUES ($1,$2,'2026-2027','2026-09-01','2027-07-05')`,
    [id(8), id(3)],
  )
  await q(
    `INSERT INTO raai_apprendre.classe
       (id, etablissement_id, offre_id, niveau_id, annee_id, nom, code_rattachement)
     VALUES ($1,$2,$3,$4,$5,'TAE 2026','TAE-2026-4K7P')`,
    [id(9), id(3), id(7), id(5), id(8)],
  )

  let e = 40
  for (const [prenom, initiale, identifiant, code] of ELEVES) {
    const eid = id(e++)
    await q(
      `INSERT INTO raai_apprendre.apprenant
         (id, etablissement_id, prenom, initiale_nom, identifiant, code_hash)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [eid, id(3), prenom, initiale, identifiant, await bcrypt.hash(code, 10)],
    )
    await q(
      `INSERT INTO raai_apprendre.inscription
         (id, apprenant_id, classe_id, etablissement_id, debut, statut)
       VALUES ($1,$2,$3,$4,'2026-09-01','active')`,
      [id(e++), eid, id(9), id(3)],
    )

    // Léa a de l'avance, Thomas commence, Inès n'a rien encore : trois états
    // différents à l'écran, sinon la démonstration ne montre qu'un seul cas.
    const niveaux =
      prenom === 'Léa'
        ? ['acquise', 'acquise', 'maitrisee', 'en_cours', 'non_abordee']
        : prenom === 'Thomas'
          ? ['acquise', 'en_cours', 'non_abordee', 'non_abordee', 'non_abordee']
          : []

    for (const [i, niveau] of niveaux.entries()) {
      await q(
        `INSERT INTO raai_apprendre.acquis_competence
           (id, apprenant_id, competence_id, version_referentiel_id, etablissement_id,
            niveau, origine)
         VALUES ($1,$2,$3,$4,$5,$6,'evaluation')`,
        [id(e++), eid, competences[i], id(6), id(3), niveau],
      )
    }
  }

  await semerFormateur(q)
  const imageId = await semerImage(q)
  const modeleId = await semerModele3d(q)
  await semerCours(q, competences, imageId, modeleId)

  console.log('\n  Jeu de démonstration semé :')
  console.log('    MFR Escatalens · Bac Pro Agroéquipement · TAE 2026')
  for (const [prenom, , identifiant, code] of ELEVES) {
    console.log(`    ${prenom.padEnd(7)} ${identifiant.padEnd(20)} code ${code}`)
  }
  console.log('    Formateur  marc@mfr-escatalens.fr       mot de passe formateur2026')
  console.log('    Direction  direction@mfr-escatalens.fr  mot de passe direction2026')
}

/**
 * Une image réelle sur le disque, pour que la démonstration exerce la chaîne
 * complète : dépôt, route de service, rendu dans la leçon.
 */
async function semerImage(q) {
  // Un PNG lisible, engendré ici plutôt que collé en base64 : un blob binaire
  // dans un dépôt ne se relit pas et ne se vérifie pas. Il ne s'agit pas
  // d'illustrer quoi que ce soit, seulement de prouver qu'un fichier traverse
  // toute la chaîne — disque, base, route de service, rendu dans la leçon —
  // et qu'on le VOIT à l'écran.
  const png = engendrerPng(480, 200)

  const etablissement = id(3)
  const chemin = `${etablissement}/${randomUUID()}`
  const destination = join(process.cwd(), 'outils', 'medias-locaux', chemin)

  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, png)

  const ressourceId = id(211)
  await q(
    `INSERT INTO raai_apprendre.ressource
       (id, etablissement_id, nom, type_mime, chemin_stockage, taille_octets,
        statut_traitement)
     VALUES ($1, $2, 'schema-circuit-hydraulique.png', 'image/png', $3, $4, 'pret')`,
    [ressourceId, etablissement, chemin, png.byteLength],
  )

  return ressourceId
}

/**
 * Deux cours réels, rattachés aux capacités C7 et C8 du référentiel rénové.
 *
 * Le contenu est écrit, pas inventé au hasard : une démonstration qui affiche
 * du faux-texte ne dit rien de ce que verra un enseignant.
 */
async function semerCours(q, competences, imageId, modeleId) {
  const M = id(200) // matière
  const MOD = id(201)
  const CH1 = id(202)
  const CH2 = id(203)
  const L1 = id(204)
  const L2 = id(205)

  await q(
    `INSERT INTO raai_apprendre.matiere (id, etablissement_id, code, intitule)
     VALUES ($1,$2,'AGROEQ','Agroéquipement')`,
    [M, id(3)],
  )
  await q(
    `INSERT INTO raai_apprendre.module_formation (id, matiere_id, code, intitule, ordre)
     VALUES ($1,$2,'MP7','Technologies des équipements',1)`,
    [MOD, M],
  )
  await q(
    `INSERT INTO raai_apprendre.chapitre (id, module_id, titre, ordre)
     VALUES ($1,$2,'Hydraulique des équipements',1)`,
    [CH1, MOD],
  )
  await q(
    `INSERT INTO raai_apprendre.chapitre (id, module_id, titre, ordre)
     VALUES ($1,$2,'Sécurité à la mise en œuvre',2)`,
    [CH2, MOD],
  )

  const lecons = [
    {
      id: L1,
      chapitre: CH1,
      titre: 'Débit, pression et puissance hydraulique',
      duree: 12,
      // C7 : « Caractériser les technologies utilisées dans les équipements »
      competence: competences[2],
      blocs: [
        {
          type: 'texte',
          texte:
            "Un circuit hydraulique transmet de la puissance par un fluide sous pression. " +
            "Deux grandeurs suffisent à le décrire : le débit, en litres par minute, et la " +
            "pression, en bars.\n\n" +
            "Le débit détermine la vitesse d'un vérin ou d'un moteur hydraulique. La pression " +
            "détermine l'effort qu'il peut développer. Un tracteur qui relève lentement un " +
            "outil lourd manque de débit, pas de pression.\n\n" +
            "La puissance hydraulique se calcule ainsi : P (kW) = Q (L/min) × p (bar) / 600. " +
            "Une pompe débitant 60 L/min sous 180 bars développe donc 18 kW.",
        },
        {
          type: 'image',
          ressourceId: imageId,
          alternative:
            'Schéma d’un circuit hydraulique simple : pompe, distributeur, vérin ' +
            'double effet et retour au réservoir.',
          legende: 'Circuit hydraulique élémentaire.',
        },
        {
          type: 'lien',
          url: 'https://chlorofil.fr/diplomes/secondaire/bac-pro/1re-term/agroequip',
          titre: 'Référentiel Bac Pro Agroéquipement',
          description: 'La fiche officielle du diplôme sur ChloroFil.',
        },
        {
          type: 'modele3d',
          ressourceId: modeleId,
          titre: 'Corps de vérin hydraulique',
          description:
            'Corps de vérin cylindrique de 60 mm de long et 24 mm de diamètre, ' +
            'avec une collerette de fixation en pied. Le piston et la tige ne ' +
            'sont pas représentés.',
          format: 'stl',
        },
        {
          type: 'bibliographie',
          references: [
            { titre: "Mémotech — Génie des équipements agricoles", auteur: 'Casteilla', annee: 2021 },
            { titre: 'Norme ISO 1219-1 — Symboles hydrauliques', annee: 2012 },
          ],
        },
      ],
    },
    {
      id: L2,
      chapitre: CH2,
      titre: 'Attelage en sécurité : les gestes qui évitent les accidents',
      duree: 9,
      // C8 : « Mettre en œuvre des équipements en sécurité »
      competence: competences[3],
      blocs: [
        {
          type: 'texte',
          texte:
            "L'attelage est le moment le plus accidentogène du travail avec un tracteur. " +
            "La majorité des accidents graves surviennent entre le tracteur et l'outil, " +
            "quand l'opérateur se place dans la zone d'écrasement.\n\n" +
            "Trois règles, dans cet ordre : couper le moteur avant toute intervention entre " +
            "le tracteur et l'outil ; ne jamais se placer entre les deux moteur tournant ; " +
            "vérifier le verrouillage des crochets avant de relever.\n\n" +
            "Le cardan est le second point critique. Un protecteur manquant ou cassé n'est " +
            "pas un détail administratif : c'est ce qui sépare une prise de force d'un " +
            "arrachement de membre.",
        },
      ],
    },
  ]

  let n = 300
  for (const lecon of lecons) {
    await q(
      `INSERT INTO raai_apprendre.lecon
         (id, chapitre_id, etablissement_id, titre, statut, duree_estimee_min, publiee_le)
       VALUES ($1,$2,$3,$4,'publiee',$5,now())`,
      [lecon.id, lecon.chapitre, id(3), lecon.titre, lecon.duree],
    )
    await q(
      `INSERT INTO raai_apprendre.lien_competence (id, lecon_id, competence_id)
       VALUES ($1,$2,$3)`,
      [id(n++), lecon.id, lecon.competence],
    )
    for (const [i, contenu] of lecon.blocs.entries()) {
      await q(
        `INSERT INTO raai_apprendre.bloc_contenu (id, lecon_id, type, contenu, ordre)
         VALUES ($1,$2,$3,$4,$5)`,
        [id(n++), lecon.id, contenu.type, JSON.stringify(contenu), i + 1],
      )
    }
  }

  await semerQuiz(q, CH1)

  // Léa a déjà lu le premier cours : le tableau de bord doit lui proposer le
  // second, pas recommencer au début.
  await q(
    `INSERT INTO raai_apprendre.lecture_lecon
       (apprenant_id, lecon_id, etablissement_id, position, terminee_le)
     VALUES ($1,$2,$3,3,now())`,
    [id(40), L1, id(3)],
  )
}

/** Un formateur, avec un mot de passe local (transitoire, avant Supabase). */
async function semerFormateur(q) {
  const COMPTE = id(100)
  await q(
    `INSERT INTO raai_apprendre.compte (id, email, nom, prenom, mot_de_passe_hash)
     VALUES ($1, 'marc@mfr-escatalens.fr', 'Delmas', 'Marc', $2)`,
    [COMPTE, await bcrypt.hash('formateur2026', 10)],
  )
  // Un administrateur d'établissement : c'est lui qui crée les classes et
  // remet les identifiants. Le formateur, lui, ne crée que des leçons.
  const ADMIN = id(103)
  await q(
    `INSERT INTO raai_apprendre.compte (id, email, nom, prenom, mot_de_passe_hash)
     VALUES ($1, 'direction@mfr-escatalens.fr', 'Bonnet', 'Sylvie', $2)`,
    [ADMIN, await bcrypt.hash('direction2026', 10)],
  )
  await q(
    `INSERT INTO raai_apprendre.membre (id, compte_id, etablissement_id, role)
     VALUES ($1, $2, $3, 'admin_etablissement')`,
    [id(104), ADMIN, id(3)],
  )

  const MEMBRE = id(101)
  await q(
    `INSERT INTO raai_apprendre.membre (id, compte_id, etablissement_id, role)
     VALUES ($1, $2, $3, 'enseignant')`,
    [MEMBRE, COMPTE, id(3)],
  )
  await q(
    `INSERT INTO raai_apprendre.affectation (id, membre_id, classe_id)
     VALUES ($1, $2, $3)`,
    [id(102), MEMBRE, id(9)],
  )
}

/**
 * Engendre un PNG opaque avec un damier, sans dépendance.
 *
 * Assez pour qu'un relecteur voie tout de suite si l'image est servie, mise à
 * l'échelle ou déformée — ce qu'un aplat uni ne montrerait pas.
 */
function engendrerPng(largeur, hauteur) {
  const brut = Buffer.alloc(hauteur * (1 + largeur * 3))

  for (let y = 0; y < hauteur; y++) {
    const debut = y * (1 + largeur * 3)
    brut[debut] = 0 // type de filtre : aucun
    for (let x = 0; x < largeur; x++) {
      const clair = (Math.floor(x / 40) + Math.floor(y / 40)) % 2 === 0
      const p = debut + 1 + x * 3
      brut[p] = clair ? 0x3f : 0x22
      brut[p + 1] = clair ? 0x8a : 0x4a
      brut[p + 2] = clair ? 0x5a : 0x33
    }
  }

  const morceau = (type, donnees) => {
    const longueur = Buffer.alloc(4)
    longueur.writeUInt32BE(donnees.length)
    const corps = Buffer.concat([Buffer.from(type, 'latin1'), donnees])
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(corps) >>> 0)
    return Buffer.concat([longueur, corps, crc])
  }

  const entete = Buffer.alloc(13)
  entete.writeUInt32BE(largeur, 0)
  entete.writeUInt32BE(hauteur, 4)
  entete[8] = 8 // profondeur
  entete[9] = 2 // couleur vraie, sans alpha

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', entete),
    morceau('IDAT', deflateSync(brut)),
    morceau('IEND', Buffer.alloc(0)),
  ])
}

const TABLE_CRC = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})

function crc32(tampon) {
  let c = 0xffffffff
  for (const octet of tampon) c = TABLE_CRC[(c ^ octet) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

/**
 * Un STL binaire engendré ici : un cylindre à collerette, qui évoque un corps
 * de vérin.
 *
 * Comme pour l'image, engendrer vaut mieux qu'un blob en base64 dans le dépôt :
 * on peut relire ce que ça produit. Le but n'est pas la justesse mécanique mais
 * de prouver que la chaîne 3D fonctionne — et une forme ronde révèle tout de
 * suite un défaut de normales ou de cadrage, ce qu'un cube masquerait.
 */
function engendrerStl(segments = 48) {
  const triangles = []
  const R = 20
  const r = 12
  const H = 60

  const point = (rayon, i, y) => {
    const a = (i / segments) * Math.PI * 2
    return [Math.cos(a) * rayon, y, Math.sin(a) * rayon]
  }

  for (let i = 0; i < segments; i++) {
    const j = (i + 1) % segments
    const [ax, , az] = point(r, i, 0)
    const [bx, , bz] = point(r, j, 0)

    // Paroi du corps.
    triangles.push([point(r, i, 0), point(r, j, 0), point(r, j, H)])
    triangles.push([point(r, i, 0), point(r, j, H), point(r, i, H)])

    // Collerette de fixation, en pied.
    triangles.push([point(R, i, 0), point(R, j, 0), point(r, j, 0)])
    triangles.push([point(R, i, 0), point(r, j, 0), point(r, i, 0)])

    // Fonds.
    triangles.push([[0, 0, 0], [ax, 0, az], [bx, 0, bz]])
    triangles.push([[0, H, 0], point(r, j, H), point(r, i, H)])
  }

  const tampon = Buffer.alloc(84 + triangles.length * 50)
  tampon.write('RAAI Apprendre - corps de verin (demonstration)', 0, 'latin1')
  tampon.writeUInt32LE(triangles.length, 80)

  let p = 84
  for (const [a, b, c] of triangles) {
    // Normale à zéro : la visionneuse les recalcule (`computeVertexNormals`).
    // Les écrire fausses serait pire que de ne pas les écrire.
    tampon.writeFloatLE(0, p)
    tampon.writeFloatLE(0, p + 4)
    tampon.writeFloatLE(0, p + 8)
    p += 12
    for (const sommet of [a, b, c]) {
      for (const valeur of sommet) {
        tampon.writeFloatLE(valeur, p)
        p += 4
      }
    }
    tampon.writeUInt16LE(0, p)
    p += 2
  }

  return tampon
}

/** Dépose le STL et renvoie l'identifiant de ressource. */
async function semerModele3d(q) {
  const stl = engendrerStl()
  const etablissement = id(3)
  const chemin = `${etablissement}/${randomUUID()}`
  const destination = join(process.cwd(), 'outils', 'medias-locaux', chemin)

  await mkdir(dirname(destination), { recursive: true })
  await writeFile(destination, stl)

  const ressourceId = id(212)
  await q(
    `INSERT INTO raai_apprendre.ressource
       (id, etablissement_id, nom, type_mime, chemin_stockage, taille_octets,
        statut_traitement)
     VALUES ($1, $2, 'corps-de-verin.stl', 'model/stl', $3, $4, 'pret')`,
    [ressourceId, etablissement, chemin, stl.byteLength],
  )

  return ressourceId
}

/**
 * Un quiz sur le chapitre d'hydraulique, avec les quatre types de questions
 * corrigés automatiquement.
 *
 * Les questions portent sur le contenu réellement écrit dans la leçon : un quiz
 * qui n'interroge pas ce qu'on vient de lire n'apprend rien et décourage.
 */
async function semerQuiz(q, chapitreId) {
  const EVAL = id(220)

  await q(
    `INSERT INTO raai_apprendre.evaluation
       (id, chapitre_id, etablissement_id, titre, type, statut, duree_max_min)
     VALUES ($1, $2, $3, 'Débit et pression : les bases', 'quiz', 'publiee', 15)`,
    [EVAL, chapitreId, id(3)],
  )

  const questions = [
    {
      intitule: 'Quelle grandeur détermine la VITESSE d’un vérin ?',
      type: 'qcm',
      options: {
        propositions: [
          'Le débit, en litres par minute',
          'La pression, en bars',
          'La température de l’huile',
          'La longueur du flexible',
        ],
      },
      corrige: { bonnes: [0] },
      bareme: 2,
    },
    {
      intitule:
        'Un tracteur relève lentement un outil lourd : il manque de pression.',
      type: 'vrai_faux',
      options: {},
      corrige: { bonne: false },
      bareme: 2,
    },
    {
      intitule:
        'Une pompe débite 60 L/min sous 180 bars. Quelle puissance développe-t-elle ?',
      type: 'numerique',
      options: { unite: 'kW' },
      // Tolérance : 18 et 18,0 valent la même chose, l'arrondi n'est pas la
      // compétence évaluée.
      corrige: { valeur: 18, tolerance: 0.5 },
      bareme: 3,
    },
    {
      intitule: 'Dans quelle unité mesure-t-on un débit hydraulique ?',
      type: 'texte_court',
      options: {},
      corrige: {
        acceptees: ['litres par minute', 'L/min', 'l par minute', 'litre par minute'],
      },
      bareme: 2,
    },
  ]

  let n = 221
  for (const [i, question] of questions.entries()) {
    await q(
      `INSERT INTO raai_apprendre.question
         (id, evaluation_id, type, enonce, options, corrige, bareme, ordre)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id(n++),
        EVAL,
        question.type,
        question.intitule,
        JSON.stringify(question.options),
        JSON.stringify(question.corrige),
        question.bareme,
        i + 1,
      ],
    )
  }
}
