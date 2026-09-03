#!/usr/bin/env node
/**
 * Vérifie la FORME d'une chaîne de connexion Postgres sans jamais afficher le
 * mot de passe : hôte, utilisateur, longueur du mot de passe, caractères
 * spéciaux qu'il faudrait encoder, crochets oubliés. Puis tente la connexion.
 *
 *   node outils/verifier-chaine-base.mjs .env.vercel.local
 */
import { readFileSync } from 'node:fs'
import dotenv from 'dotenv'
import pg from 'pg'

const fichier = process.argv[2] ?? '.env.local'
const env = dotenv.parse(readFileSync(fichier))
const cle = Object.keys(env).find((k) => k.replace(/^﻿/, '') === 'DIRECT_URL')
  ?? Object.keys(env).find((k) => k.replace(/^﻿/, '') === 'DATABASE_URL')
if (!cle) {
  console.log('Aucune ligne DIRECT_URL ni DATABASE_URL dans', fichier)
  process.exit(1)
}
const valeur = env[cle]
console.log(`variable lue : ${JSON.stringify(cle)} (longueur ${valeur.length})`)

let u
try {
  u = new URL(valeur)
} catch {
  console.log('URL illisible : vérifier les guillemets, espaces ou retours à la ligne.')
  process.exit(1)
}
const mdp = u.password
const speciaux = [...new Set(mdp.replace(/[A-Za-z0-9]/g, ''))].join(' ')
console.log(`hôte ${u.hostname} | port ${u.port || '(défaut)'} | utilisateur ${u.username}`)
console.log(`mot de passe : ${mdp.length} caractères | crochets [ ] : ${/[\[\]]/.test(mdp) ? 'OUI — à retirer' : 'non'} | caractères spéciaux : ${speciaux || 'aucun'}`)
if (/%[0-9A-Fa-f]{2}/.test(mdp)) console.log('(contient des séquences %xx : déjà encodé, ou un % à encoder en %25)')

const client = new pg.Client({ connectionString: valeur, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 15000 })
try {
  await client.connect()
  const r = await client.query('select current_user, version()')
  console.log('CONNEXION OK :', r.rows[0].current_user)
  await client.end()
} catch (e) {
  console.log('CONNEXION REFUSÉE :', e.message)
}
