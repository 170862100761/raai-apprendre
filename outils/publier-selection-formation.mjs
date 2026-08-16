#!/usr/bin/env node
/**
 * Publication d'une sélection de leçons reprises de RAAI-Formation, pour la
 * démonstration.
 *
 * La plateforme refuse de publier une leçon sans compétence rattachée — c'est
 * le garde-fou qui rend la grille de suivi honnête. Cet outil rattache donc
 * chaque leçon retenue à la capacité du Bac Pro Agroéquipement la plus
 * proche, **de bonne foi et pour la démonstration** : un établissement réel
 * refera ses rattachements lors de la relecture, et seules les leçons dont le
 * sujet parle à un élève d'agroéquipement sont retenues — publier
 * « Aérostructure » sous un diplôme agricole décrédibiliserait la grille.
 *
 * Usage : npm run formation:publier-selection
 * (DATABASE_URL décide de la base — .env.local en local, l'environnement sinon.)
 */
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import pg from 'pg'

/** Mêmes identifiants stables que `importer-formation.mjs`. */
const idStable = (...parties) => {
  const h = createHash('sha256').update(parties.join('|')).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}
const idDemo = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

// Capacités du jeu de démonstration : C5..C9 (outils/semer-demo.mjs).
const C5 = idDemo(20)
const C7 = idDemo(22)
const C8 = idDemo(23)
const C9 = idDemo(24)

/** Le rattachement de bonne foi, par slug RAAI-Formation. */
const SELECTION = {
  // Le cœur du métier — C9 « Réaliser des opérations de maintenance ».
  'maintenance-preventive': C9,
  lubrification: C9,
  hydraulique: C9,
  pneumatique: C9,
  capteurs: C9,
  'analyse-vibratoire': C9,
  diagnostic: C9,
  gmao: C9,
  engrenages: C9,
  roulements: C9,
  // C8 « Mettre en œuvre des équipements en sécurité ».
  assemblages: C8,
  soudage: C8,
  // C7 « Adapter les équipements » — lecture de plan, contrôle.
  lectureplan: C7,
  metrologie: C7,
  // C5 « Choisir un équipement adapté ».
  materiaux: C5,
  energie: C5,
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
  let publiees = 0
  for (const [slug, competenceId] of Object.entries(SELECTION)) {
    const leconId = idStable('formation-lecon', slug)
    const lecon = await bd.query(`SELECT titre FROM raai_apprendre.lecon WHERE id = $1`, [
      leconId,
    ])
    if (lecon.rows.length === 0) {
      console.warn(`  absente, ignorée : ${slug}`)
      continue
    }

    // Le lien AVANT la publication : l'ordre inverse laisserait exister,
    // même un instant, une leçon publiée sans compétence.
    await bd.query(
      `INSERT INTO raai_apprendre.lien_competence (id, lecon_id, competence_id)
       VALUES ($1, $2, $3)
       ON CONFLICT (lecon_id, competence_id) DO NOTHING`,
      [idStable('formation-lien', slug), leconId, competenceId],
    )
    await bd.query(
      `UPDATE raai_apprendre.lecon
          SET statut = 'publiee', publiee_le = now()
        WHERE id = $1 AND statut = 'brouillon'`,
      [leconId],
    )
    publiees++
    console.log(`  publiée : ${lecon.rows[0].titre}`)
  }

  const total = await bd.query(
    `SELECT count(*) c FROM raai_apprendre.lecon WHERE statut = 'publiee'`,
  )
  console.log(`\n${publiees} leçon(s) traitée(s) — total publié : ${total.rows[0].c}.`)
} finally {
  await bd.end()
}
