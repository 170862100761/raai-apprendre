#!/usr/bin/env node
/**
 * Quiz d'accompagnement pour les leçons reprises de RAAI-Formation.
 *
 * Rédigés par une IA à partir du contenu des leçons, donc : `genere_par_ia`
 * sur chaque question, et le quiz entier reste en **brouillon**. La règle du
 * projet est sans exception — aucun contenu généré ne part vers les élèves
 * sans validation humaine — et c'est l'enseignant qui publie après relecture.
 *
 * Idempotent : identifiants dérivés des slugs, relancer met à jour les
 * brouillons sans dupliquer, et ne touche jamais un quiz déjà publié.
 *
 * Usage : DATABASE_URL=… npm run formation:semer-quiz
 */
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import pg from 'pg'

const idStable = (...parties) => {
  const h = createHash('sha256').update(parties.join('|')).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

const ETABLISSEMENT = '00000000-0000-4000-8000-000000000003'

/**
 * Raccourcis de rédaction.
 *
 * Les QCM sont écrits bonne réponse en tête, c'est plus lisible à relire ;
 * mais servis ainsi, un élève qui coche toujours la première case a 100 %.
 * On mélange donc les propositions — de façon DÉTERMINISTE (graine = énoncé),
 * pour que relancer le semis ne change pas l'ordre d'un quiz déjà vu.
 */
function melanger(propositions, enonce) {
  const graine = createHash('sha256').update(enonce).digest()
  const ordre = propositions.map((_, i) => i)
  for (let i = ordre.length - 1; i > 0; i--) {
    const j = graine[i % graine.length] % (i + 1)
    ;[ordre[i], ordre[j]] = [ordre[j], ordre[i]]
  }
  return ordre
}
const qcm = (enonce, propositions, bonnes, bareme = 2) => {
  const ordre = melanger(propositions, enonce)
  return {
    type: 'qcm',
    enonce,
    options: { propositions: ordre.map((i) => propositions[i]) },
    corrige: { bonnes: bonnes.map((b) => ordre.indexOf(b)) },
    bareme,
  }
}
const vf = (enonce, bonne, bareme = 1) => ({
  type: 'vrai_faux', enonce, options: {}, corrige: { bonne }, bareme,
})
const num = (enonce, unite, valeur, tolerance, bareme = 2) => ({
  type: 'numerique', enonce, options: { unite }, corrige: { valeur, tolerance }, bareme,
})

/** Un quiz par slug de leçon publiée. */
const QUIZ = {
  'maintenance-preventive': [
    qcm('Quel est le but premier de la maintenance préventive ?', [
      'Intervenir avant la panne, à intervalles planifiés',
      'Réparer au plus vite après une casse',
      'Remplacer systématiquement toutes les pièces chaque année',
      'Éviter de tenir un carnet d’entretien',
    ], [0]),
    vf('La maintenance corrective consiste à intervenir après l’apparition de la défaillance.', true),
    qcm('Un plan de maintenance préventive se construit d’abord à partir…', [
      'des préconisations du constructeur et des heures d’utilisation',
      'de la couleur de la machine',
      'du prix des pièces détachées uniquement',
      'des seules habitudes de l’atelier',
    ], [0]),
    vf('Une intervention préventive n’a pas besoin d’être tracée dans le carnet d’entretien.', false),
  ],
  lubrification: [
    qcm('Quel est le rôle principal d’un lubrifiant ?', [
      'Réduire le frottement et l’usure entre pièces en mouvement',
      'Augmenter la température du mécanisme',
      'Durcir les surfaces métalliques',
      'Remplacer les joints d’étanchéité',
    ], [0]),
    vf('Trop de graisse dans un roulement peut l’échauffer autant que pas assez.', true),
    qcm('L’indice de viscosité d’une huile décrit…', [
      'la variation de sa viscosité avec la température',
      'sa couleur',
      'son prix au litre',
      'sa densité à froid uniquement',
    ], [0]),
    vf('On peut mélanger sans risque deux graisses de savons différents.', false),
  ],
  hydraulique: [
    qcm('Quelle grandeur détermine l’EFFORT que peut développer un vérin ?', [
      'La pression, en bars',
      'Le débit, en litres par minute',
      'La longueur du flexible',
      'La température de l’huile',
    ], [0]),
    num('Une pompe débite 30 L/min sous 200 bars. Quelle puissance hydraulique développe-t-elle ? (P = Q × p / 600)', 'kW', 10, 0.5),
    vf('Le débit détermine la vitesse de sortie de tige d’un vérin.', true),
    vf('Une huile hydraulique polluée n’a aucun effet sur la durée de vie des composants.', false),
  ],
  pneumatique: [
    qcm('Dans un circuit pneumatique, quel composant commute la puissance vers le vérin ?', [
      'Le distributeur',
      'Le compresseur',
      'Le manomètre',
      'Le silencieux',
    ], [0]),
    vf('L’air comprimé étant compressible, un vérin pneumatique tient moins bien une position intermédiaire qu’un vérin hydraulique.', true),
    qcm('Le rôle de l’unité de conditionnement (FRL) est de…', [
      'filtrer, réguler la pression et lubrifier l’air',
      'refroidir le compresseur',
      'stocker l’air comprimé',
      'mesurer le débit consommé',
    ], [0]),
    vf('Purger les condensats du circuit ne sert à rien en pneumatique.', false),
  ],
  capteurs: [
    qcm('Un capteur inductif détecte…', [
      'les pièces métalliques, sans contact',
      'tous les matériaux, par contact',
      'uniquement les liquides',
      'la couleur des objets',
    ], [0]),
    qcm('Quel capteur choisir pour détecter un objet non métallique (bois, plastique) sans contact ?', [
      'Un capteur capacitif ou photoélectrique',
      'Un capteur inductif',
      'Un contact mécanique uniquement',
      'Aucun capteur ne le permet',
    ], [0]),
    vf('Un capteur TOR (tout ou rien) délivre une information binaire : présence ou absence.', true),
    vf('La distance de détection d’un capteur inductif est identique pour tous les métaux.', false),
  ],
  'analyse-vibratoire': [
    qcm('L’analyse vibratoire sert principalement à…', [
      'détecter une dégradation (balourd, roulement, alignement) avant la panne',
      'mesurer la consommation de carburant',
      'régler la pression des pneus',
      'contrôler le niveau d’huile',
    ], [0]),
    vf('Un balourd se manifeste par une vibration à la fréquence de rotation de l’arbre.', true),
    qcm('Une élévation des vibrations à haute fréquence sur un palier oriente d’abord vers…', [
      'un défaut de roulement',
      'un pneu sous-gonflé',
      'un réservoir trop plein',
      'une courroie neuve',
    ], [0]),
    vf('On attend la panne pour faire une mesure vibratoire de référence.', false),
  ],
  diagnostic: [
    qcm('La première étape d’un diagnostic de panne méthodique est…', [
      'constater et délimiter le dysfonctionnement (symptômes, conditions)',
      'démonter entièrement la machine',
      'remplacer la pièce la plus chère',
      'redémarrer et espérer',
    ], [0]),
    vf('Changer des pièces au hasard jusqu’à ce que ça remarche est une méthode de diagnostic acceptable.', false),
    qcm('Un arbre des causes (ou logigramme) sert à…', [
      'organiser la recherche de cause de l’effet vers l’origine',
      'commander les pièces détachées',
      'planifier les congés de l’atelier',
      'mesurer une tension électrique',
    ], [0]),
    vf('Vérifier d’abord ce qui est simple et probable (alimentation, fusible, niveau) fait gagner du temps.', true),
  ],
  gmao: [
    qcm('Que signifie GMAO ?', [
      'Gestion de la Maintenance Assistée par Ordinateur',
      'Grand Manuel des Ateliers et Outillages',
      'Groupe de Maintenance des Appareils d’Occasion',
      'Gestion des Machines et Outils',
    ], [0]),
    qcm('Le MTBF mesure…', [
      'le temps moyen entre deux défaillances',
      'le temps moyen de réparation',
      'le coût moyen d’une pièce',
      'la durée d’une vidange',
    ], [0]),
    vf('Le MTTR mesure le temps moyen pour réparer après une défaillance.', true),
    vf('Un historique d’interventions bien tenu ne sert à rien pour prévoir les pannes.', false),
  ],
  engrenages: [
    num('Un pignon de 20 dents entraîne une roue de 60 dents. Quel est le rapport de réduction (vitesse sortie / vitesse entrée) ?', '', 0.33, 0.02),
    qcm('Dans une transmission par chaîne, la tension correcte se contrôle…', [
      'par la flèche du brin, mesurée à mi-distance des pignons',
      'à l’oreille, moteur lancé',
      'en tirant la chaîne à la main le plus fort possible',
      'elle ne se contrôle pas',
    ], [0]),
    vf('Un défaut d’alignement des poulies réduit fortement la durée de vie d’une courroie.', true),
    vf('Une courroie qui patine transmet quand même toute la puissance.', false),
  ],
  roulements: [
    qcm('La durée de vie L10 d’un roulement correspond à…', [
      'la durée atteinte par 90 % d’une population de roulements identiques',
      'la durée de la garantie constructeur',
      'la durée maximale possible',
      'dix ans, quel que soit l’usage',
    ], [0]),
    vf('Doubler la charge appliquée à un roulement à billes divise sa durée de vie par environ huit.', true),
    qcm('Au montage d’un roulement, on frappe…', [
      'sur la bague montée serrée, jamais à travers les corps roulants',
      'directement sur la bague libre',
      'au marteau sur la cage',
      'n’importe où, ça n’a pas d’importance',
    ], [0]),
    vf('Un roulement qui chauffe anormalement est un signe de dégradation ou de défaut de montage.', true),
  ],
  assemblages: [
    qcm('Le couple de serrage d’une vis sert à…', [
      'créer une précontrainte qui maintient l’assemblage',
      'faire joli sur la fiche technique',
      'user le filetage volontairement',
      'compenser un mauvais perçage',
    ], [0]),
    qcm('Dans la désignation « vis M10 × 1,5 », que signifie 10 ?', [
      'Le diamètre nominal du filetage, en millimètres',
      'La longueur de la vis',
      'Le pas du filetage',
      'La classe de qualité',
    ], [0]),
    vf('La classe de qualité 8.8 renseigne sur la résistance mécanique de la vis.', true),
    vf('Serrer « le plus fort possible » vaut mieux que respecter le couple préconisé.', false),
  ],
  soudage: [
    qcm('Le procédé MAG utilise…', [
      'un fil-électrode fusible sous gaz actif',
      'une électrode enrobée sans gaz',
      'une flamme oxyacétylénique',
      'un faisceau laser',
    ], [0]),
    vf('Le soudage à l’arc impose de protéger les yeux et la peau du rayonnement.', true),
    qcm('Le rôle du gaz de protection en MIG/MAG est de…', [
      'protéger le bain de fusion de l’air ambiant',
      'refroidir la torche',
      'accélérer le dévidage du fil',
      'colorer le cordon',
    ], [0]),
    vf('On peut souder un réservoir ayant contenu un liquide inflammable sans précaution particulière.', false),
  ],
  lectureplan: [
    qcm('Sur un dessin technique, un trait interrompu fin représente…', [
      'des arêtes cachées',
      'les arêtes vues',
      'les axes de symétrie',
      'les cotes',
    ], [0]),
    qcm('Le cartouche d’un plan contient notamment…', [
      'l’échelle, le titre et l’indice de révision',
      'le prix de la pièce',
      'le nom du client final uniquement',
      'la couleur de peinture',
    ], [0]),
    vf('À l’échelle 1:2, la pièce est dessinée deux fois plus petite que nature.', true),
    vf('Une cote entre parenthèses est une cote qui s’impose à la fabrication.', false),
  ],
  metrologie: [
    num('Sur un pied à coulisse au 1/50, quelle est la résolution de lecture ?', 'mm', 0.02, 0.001),
    qcm('Pour mesurer un diamètre au centième de millimètre, on choisit…', [
      'un micromètre (palmer)',
      'un réglet',
      'un mètre ruban',
      'une équerre',
    ], [0]),
    vf('Un instrument de mesure doit être étalonné ou vérifié périodiquement.', true),
    vf('La température de la pièce n’a aucune influence sur la mesure.', false),
  ],
  materiaux: [
    qcm('La désignation S235 caractérise…', [
      'un acier de construction de limite élastique 235 MPa',
      'un aluminium',
      'une fonte grise',
      'un polymère',
    ], [0]),
    qcm('Dans « X5CrNi18-10 », le X signifie…', [
      'acier fortement allié (au moins un élément ≥ 5 %)',
      'acier non allié',
      'traitement thermique interdit',
      'matériau expérimental',
    ], [0]),
    vf('L’aluminium est plus léger que l’acier à volume égal.', true),
    vf('Tous les aciers inoxydables sont magnétiques.', false),
  ],
  energie: [
    num('Une charge de 200 kg est levée de 3 m (g = 9,81 m/s²). Quelle énergie potentielle a-t-elle gagnée ?', 'J', 5886, 60),
    qcm('La puissance est…', [
      'un débit d’énergie (énergie par unité de temps)',
      'une force',
      'une distance',
      'une température',
    ], [0]),
    vf('Dans une chaîne de transmission, les rendements de chaque étage se multiplient.', true),
    vf('Un rendement peut être supérieur à 1 si la machine est bien réglée.', false),
  ],
}

function lireUrl() {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL
  for (const fichier of ['.env.local', '.env']) {
    if (!existsSync(fichier)) continue
    const ligne = readFileSync(fichier, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith('DATABASE_URL='))
    if (ligne) return ligne.slice('DATABASE_URL='.length).replace(/^"|"$/g, '')
  }
  return null
}

const url = lireUrl()
if (!url) {
  console.error('DATABASE_URL introuvable.')
  process.exit(1)
}

const bd = new pg.Client({ connectionString: url })
await bd.connect()
try {
  let crees = 0
  for (const [slug, questions] of Object.entries(QUIZ)) {
    const chapitreId = idStable('formation-chapitre', slug)
    const chapitre = await bd.query(
      `SELECT titre FROM raai_apprendre.chapitre WHERE id = $1`,
      [chapitreId],
    )
    if (chapitre.rows.length === 0) {
      console.warn(`  chapitre absent, ignoré : ${slug}`)
      continue
    }

    const quizId = idStable('formation-quiz', slug)
    const deja = await bd.query(`SELECT statut FROM raai_apprendre.evaluation WHERE id = $1`, [
      quizId,
    ])
    if (deja.rows.length > 0 && deja.rows[0].statut !== 'brouillon') {
      console.log(`  déjà publié, conservé : ${slug}`)
      continue
    }

    await bd.query(
      `INSERT INTO raai_apprendre.evaluation
         (id, chapitre_id, etablissement_id, titre, type, statut)
       VALUES ($1, $2, $3, $4, 'quiz', 'brouillon')
       ON CONFLICT (id) DO UPDATE SET titre = EXCLUDED.titre`,
      [quizId, chapitreId, ETABLISSEMENT, `Quiz — ${chapitre.rows[0].titre}`],
    )
    await bd.query(`DELETE FROM raai_apprendre.question WHERE evaluation_id = $1`, [quizId])
    for (const [rang, question] of questions.entries()) {
      await bd.query(
        `INSERT INTO raai_apprendre.question
           (id, evaluation_id, type, enonce, options, corrige, bareme, ordre, genere_par_ia)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, true)`,
        [
          idStable('formation-question', slug, String(rang)),
          quizId,
          question.type,
          question.enonce,
          JSON.stringify(question.options),
          JSON.stringify(question.corrige),
          question.bareme,
          rang + 1,
        ],
      )
    }
    crees++
    console.log(`  brouillon : Quiz — ${chapitre.rows[0].titre} (${questions.length} questions)`)
  }

  console.log(
    `\n${crees} quiz en brouillon. Aucun n'est visible des élèves : chaque` +
      ` question est marquée « générée par IA » et attend relecture puis` +
      ` publication par un enseignant.`,
  )
} finally {
  await bd.end()
}
