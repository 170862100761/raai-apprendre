#!/usr/bin/env node
/**
 * Vérifie que les clés Supabase d'un fichier d'environnement sont acceptées
 * par le projet qu'elles désignent, sans rien afficher d'elles : la clé
 * anonyme (celle que le site utilise pour la connexion) et la clé service.
 * Dit aussi si la connexion par e-mail + mot de passe est activée.
 *
 *   node outils/verifier-cles-supabase.mjs .env.vercel.local
 */
import { readFileSync } from 'node:fs'
import dotenv from 'dotenv'

const env = dotenv.parse(readFileSync(process.argv[2] ?? '.env.local'))
const url = env.NEXT_PUBLIC_SUPABASE_URL
const anonyme = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const service = env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !anonyme || !service) {
  console.log('Il manque une des trois variables Supabase.')
  process.exit(1)
}
console.log('projet', new URL(url).hostname)

const role = (cle) => {
  try {
    return JSON.parse(Buffer.from(cle.split('.')[1], 'base64url').toString()).role ?? '(sans rôle)'
  } catch {
    return '(pas un JWT)'
  }
}
console.log(`clé anonyme : rôle déclaré « ${role(anonyme)} », ${anonyme.length} caractères`)
console.log(`clé service : rôle déclaré « ${role(service)} », ${service.length} caractères`)

const essai = async (nom, cle, chemin) => {
  const r = await fetch(url + chemin, { headers: { apikey: cle, Authorization: 'Bearer ' + cle } })
  const corps = await r.text()
  console.log(`${nom} → ${r.status}${r.ok ? '' : ' : ' + corps.slice(0, 120)}`)
  return r.ok ? JSON.parse(corps) : null
}
const reglages = await essai('clé anonyme sur /auth/v1/settings', anonyme, '/auth/v1/settings')
if (reglages) {
  console.log(`  connexion e-mail activée : ${reglages.external?.email ?? '?'} | inscription désactivée : ${reglages.disable_signup ?? '?'}`)
}
await essai('clé service sur /auth/v1/admin/users (1 seul, non affiché)', service, '/auth/v1/admin/users?page=1&per_page=1')
