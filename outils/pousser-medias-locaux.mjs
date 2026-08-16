#!/usr/bin/env node
/**
 * Pousse les fichiers de `outils/medias-locaux` vers le bucket Supabase
 * `medias`, pour les ressources que la base référence.
 *
 * Cas d'usage : le jeu de démonstration écrit ses médias sur le disque local
 * (stockage transitoire) ; quand la base visée est Supabase, les lignes
 * `ressource` existent mais les octets manquent au bucket, et les leçons
 * affichent des médias morts. Cet outil rapproche les deux.
 *
 * Ne touche qu'aux ressources dont le fichier local existe. Idempotent
 * (`upsert`) : relancer n'écrase que par le même contenu.
 *
 * Usage :
 *   DATABASE_URL / NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY requis
 *   npm run medias:pousser
 */
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

function lireVariable(nom) {
  if (process.env[nom]) return process.env[nom]
  for (const fichier of ['.env.local', '.env']) {
    if (!existsSync(fichier)) continue
    const ligne = readFileSync(fichier, 'utf8')
      .split(/\r?\n/)
      .find((l) => l.startsWith(`${nom}=`))
    if (ligne) {
      const valeur = ligne.slice(nom.length + 1).replace(/^"|"$/g, '')
      if (valeur) return valeur
    }
  }
  return null
}

const urlBase = lireVariable('DATABASE_URL')
const urlSupabase = lireVariable('NEXT_PUBLIC_SUPABASE_URL')
const cleServiceRole = lireVariable('SUPABASE_SERVICE_ROLE_KEY')

if (!urlBase || !urlSupabase || !cleServiceRole) {
  console.error(
    'Variables requises : DATABASE_URL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.',
  )
  process.exit(1)
}

const RACINE = join(process.cwd(), 'outils', 'medias-locaux')

const bd = new pg.Client({ connectionString: urlBase })
await bd.connect()
try {
  const ressources = await bd.query(
    `SELECT nom, type_mime, chemin_stockage FROM raai_apprendre.ressource
      UNION
     SELECT nom, 'model/gltf-binary', chemin_apercu FROM raai_apprendre.ressource
      WHERE chemin_apercu IS NOT NULL`,
  )

  let pousses = 0
  for (const r of ressources.rows) {
    const local = join(RACINE, r.chemin_stockage)
    if (!existsSync(local)) {
      console.warn(`  absent en local, ignoré : ${r.nom} (${r.chemin_stockage})`)
      continue
    }
    const contenu = readFileSync(local)
    const reponse = await fetch(
      `${urlSupabase}/storage/v1/object/medias/${r.chemin_stockage}`,
      {
        method: 'POST',
        headers: {
          // Les clés `sb_secret_…` ne sont pas des JWT : le Storage les
          // reconnaît par l'en-tête `apikey`, pas par `Authorization`.
          apikey: cleServiceRole,
          Authorization: `Bearer ${cleServiceRole}`,
          'Content-Type': r.type_mime,
          'x-upsert': 'true',
        },
        body: contenu,
      },
    )
    if (!reponse.ok) {
      console.error(`  ÉCHEC ${r.nom} : ${reponse.status} ${await reponse.text()}`)
      continue
    }
    pousses++
    console.log(`  poussé : ${r.nom} (${contenu.length} octets)`)
  }
  console.log(`\n${pousses} fichier(s) poussé(s) vers le bucket medias.`)
} finally {
  await bd.end()
}
