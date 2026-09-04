#!/usr/bin/env node
/**
 * Dépose dans Supabase Storage les fichiers des trois ressources du jeu de
 * démonstration, aux chemins que la base connaît déjà : le semis écrivait
 * sur disque, et sur Vercel ce disque n'existe pas — la médiathèque
 * pointait vers du vide.
 *
 *   node outils/poser-medias-demo.mjs .env.vercel.local [--png chemin/vers/schema.png]
 *
 * Le schéma hydraulique : un vrai dessin (par défaut celui de RAAI
 * Formation, rendu en PNG), à la place du damier vert généré par le semis.
 * Le STL est regénéré par `engendrerStl` ; le STEP est le fichier d'essai.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import dotenv from 'dotenv'
import pg from 'pg'
import { createClient } from '@supabase/supabase-js'
import { engendrerStl } from './semer-demo.mjs'

function argument(nom, defaut) {
  const rang = process.argv.indexOf(`--${nom}`)
  return rang >= 0 ? process.argv[rang + 1] : defaut
}
const fichierEnv = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : '.env.local'
const cheminPng = argument('png', null)
const env = dotenv.parse(readFileSync(fichierEnv))
for (const n of ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY']) {
  if (!env[n]) {
    console.error(`${n} manquante dans ${fichierEnv}`)
    process.exit(1)
  }
}
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const stockage = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }).storage.from('medias')
const bd = new pg.Client({ connectionString: env.DIRECT_URL ?? env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await bd.connect()

const fichiers = [
  { ressource: id(211), octets: cheminPng ? new Uint8Array(readFileSync(cheminPng)) : null, typeMime: 'image/png' },
  { ressource: id(212), octets: new Uint8Array(engendrerStl()), typeMime: 'model/stl' },
  { ressource: id(213), octets: new Uint8Array(readFileSync(join(process.cwd(), 'src', 'test', 'fichiers', 'piece-essai.stp'))), typeMime: 'model/step' },
]
let poses = 0
for (const f of fichiers) {
  const ligne = (await bd.query(`SELECT nom, chemin_stockage FROM raai_apprendre.ressource WHERE id = $1`, [f.ressource])).rows[0]
  if (!ligne) {
    console.warn(`  ressource ${f.ressource} absente, ignorée`)
    continue
  }
  if (!f.octets) {
    console.warn(`  ${ligne.nom} : aucun fichier fourni (--png), ignoré`)
    continue
  }
  const { error } = await stockage.upload(ligne.chemin_stockage, f.octets, { contentType: f.typeMime, upsert: true })
  if (error) throw new Error(`${ligne.nom} : ${error.message}`)
  await bd.query(`UPDATE raai_apprendre.ressource SET taille_octets = $2 WHERE id = $1`, [f.ressource, f.octets.byteLength])
  console.log(`  ${ligne.nom} → ${ligne.chemin_stockage} (${f.octets.byteLength} octets)`)
  poses++
}
await bd.end()
console.log(`${poses} fichier(s) déposé(s) dans le seau « medias ».`)
