#!/usr/bin/env node
/**
 * Pour un compte adulte donné par son e-mail : l'utilisateur Supabase, la
 * ligne `compte`, ses `membre` (rôle, établissement) et ses affectations —
 * exactement ce que `chargerProfilCompte` lit pour bâtir la session. Quand un
 * formateur boucle entre deux pages, c'est ici qu'on voit ce qui manque.
 *
 *   node outils/diagnostiquer-compte.mjs .env.vercel.local essai+enseignant@raai-designer.com
 */
import { readFileSync } from 'node:fs'
import dotenv from 'dotenv'
import pg from 'pg'

const [fichier = '.env.local', email] = process.argv.slice(2)
if (!email) {
  console.error('Usage : node outils/diagnostiquer-compte.mjs <fichier .env> <email>')
  process.exit(1)
}
const env = dotenv.parse(readFileSync(fichier))
const client = new pg.Client({ connectionString: env.DIRECT_URL ?? env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await client.connect()
const q = async (sql, params) => (await client.query(sql, params)).rows

const auth = await q(`SELECT id, email_confirmed_at IS NOT NULL AS confirme, last_sign_in_at FROM auth.users WHERE email = $1`, [email])
console.log('Supabase auth.users :', auth.length ? `${auth[0].id} | confirmé ${auth[0].confirme} | dernière connexion ${auth[0].last_sign_in_at ?? 'jamais'}` : 'AUCUN')

const comptes = await q(`SELECT id, actif, prenom, nom FROM raai_apprendre.compte WHERE email = $1`, [email])
console.log('raai_apprendre.compte :', comptes.length ? comptes.map((c) => `${c.id} | actif ${c.actif} | ${c.prenom} ${c.nom}`).join(' ; ') : 'AUCUN')
if (auth.length && comptes.length && auth[0].id !== comptes[0].id) {
  console.log('!! L identifiant Supabase et celui du compte DIFFÈRENT : la session ne trouvera jamais le profil.')
}

for (const c of comptes) {
  const membres = await q(
    `SELECT m.id, m.role, m.expire_le, e.nom AS etablissement, e.uai,
            (SELECT count(*) FROM raai_apprendre.affectation a WHERE a.membre_id = m.id)::int AS affectations
     FROM raai_apprendre.membre m
     LEFT JOIN raai_apprendre.etablissement e ON e.id = m.etablissement_id
     WHERE m.compte_id = $1`,
    [c.id],
  )
  console.log(`membres du compte ${c.id.slice(0, 8)}… : ${membres.length}`)
  for (const m of membres) {
    console.log(`  - ${m.role} @ ${m.etablissement ?? '(portée nationale)'} ${m.uai ?? ''} | affectations ${m.affectations} | expire ${m.expire_le ?? 'jamais'}`)
  }
}
await client.end()
