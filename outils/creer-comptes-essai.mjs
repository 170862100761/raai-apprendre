#!/usr/bin/env node
/**
 * Crée un jeu de comptes d'essai en PRODUCTION, un par type de compte :
 * administrateur national, administrateur d'établissement, responsable
 * pédagogique, enseignant, parent — et un élève (identifiant + code).
 *
 *   node outils/creer-comptes-essai.mjs .env.supabase
 *
 * Le fichier d'environnement doit porter NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY et DIRECT_URL (ou DATABASE_URL). Les adultes
 * naissent dans Supabase Auth (adresse confirmée d'office) ET dans
 * `raai_apprendre.compte` avec le même id, comme le fait la connexion.
 *
 * Les mots de passe sont tirés au hasard et affichés UNE fois, à la fin :
 * ils ne sont écrits nulle part. Relancer le script sur un compte existant
 * lui redonne un nouveau mot de passe (les autres lignes sont conservées).
 */
import { readFileSync } from 'node:fs'
import { randomInt, randomUUID } from 'node:crypto'
import dotenv from 'dotenv'
import pg from 'pg'
import bcrypt from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'

const fichier = process.argv[2] ?? '.env.supabase'
const env = dotenv.parse(readFileSync(fichier))
const manquantes = ['NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'].filter((n) => !env[n])
if (manquantes.length || !(env.DIRECT_URL || env.DATABASE_URL)) {
  console.error(`Variables manquantes dans ${fichier} : ${[...manquantes, 'DIRECT_URL'].join(', ')}`)
  process.exit(1)
}

const DOMAINE = 'raai-designer.com'
const ADULTES = [
  { cle: 'admin-national', role: 'admin_national', prenom: 'Aline', nom: 'Essai', portee: 'nationale' },
  { cle: 'admin-etablissement', role: 'admin_etablissement', prenom: 'Sylvain', nom: 'Essai', portee: 'etablissement' },
  { cle: 'responsable', role: 'responsable_pedagogique', prenom: 'Nadia', nom: 'Essai', portee: 'etablissement' },
  { cle: 'enseignant', role: 'enseignant', prenom: 'Marc', nom: 'Essai', portee: 'etablissement' },
  { cle: 'parent', role: 'parent', prenom: 'Claire', nom: 'Essai', portee: 'etablissement' },
]

/** Mot de passe lisible : 3 mots de 4 lettres + 2 chiffres, sans caractère ambigu. */
function motDePasse() {
  const lettres = 'abcdefghjkmnpqrstuvwxyz'
  const mot = () => Array.from({ length: 4 }, () => lettres[randomInt(lettres.length)]).join('')
  return `${mot()}-${mot()}-${mot()}-${randomInt(10, 99)}`
}
const code4 = () => String(randomInt(1000, 9999))

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})
const bd = new pg.Client({ connectionString: env.DIRECT_URL ?? env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
await bd.connect()
const q = async (sql, params = []) => (await bd.query(sql, params)).rows

// --- Structure d'accueil : un établissement, une classe si elle existe -----
let etab = (await q(`SELECT id, nom, uai FROM raai_apprendre.etablissement WHERE actif ORDER BY cree_le LIMIT 1`))[0]
if (!etab) {
  let pays = (await q(`SELECT id FROM raai_apprendre.pays WHERE code = 'FR'`))[0]
  if (!pays) pays = (await q(`INSERT INTO raai_apprendre.pays (id, code, nom) VALUES ($1,'FR','France') RETURNING id`, [randomUUID()]))[0]
  let academie = (await q(`SELECT id FROM raai_apprendre.academie ORDER BY code LIMIT 1`))[0]
  if (!academie) {
    academie = (await q(`INSERT INTO raai_apprendre.academie (id, pays_id, code, nom) VALUES ($1,$2,'TOULOUSE','Toulouse') RETURNING id`, [randomUUID(), pays.id]))[0]
  }
  etab = (await q(
    `INSERT INTO raai_apprendre.etablissement (id, academie_id, uai, nom, type, mode_identite)
     VALUES ($1,$2,'0000000E','Établissement d''essai RAAI','LPA','minimal') RETURNING id, nom, uai`,
    [randomUUID(), academie.id],
  ))[0]
  console.log(`+ établissement créé : ${etab.nom}`)
}
const classe = (await q(
  `SELECT id, nom, code_rattachement FROM raai_apprendre.classe WHERE etablissement_id = $1 AND NOT archivee ORDER BY cree_le LIMIT 1`,
  [etab.id],
))[0]

// --- Adultes : Supabase Auth + compte + membre --------------------------------
const resultats = []
for (const a of ADULTES) {
  const email = `essai+${a.cle}@${DOMAINE}`
  const mdp = motDePasse()

  // Supabase : créer, ou retrouver et changer le mot de passe.
  let userId
  const creation = await supabase.auth.admin.createUser({
    email, password: mdp, email_confirm: true,
    user_metadata: { prenom: a.prenom, nom: a.nom, essai: true },
  })
  if (creation.error) {
    if (!/already|exists|registered/i.test(creation.error.message)) throw creation.error
    const existant = (await q(`SELECT id FROM auth.users WHERE email = $1`, [email]))[0]
    if (!existant) throw new Error(`Compte Supabase introuvable pour ${email}`)
    userId = existant.id
    const maj = await supabase.auth.admin.updateUserById(userId, { password: mdp })
    if (maj.error) throw maj.error
  } else {
    userId = creation.data.user.id
  }

  await q(
    `INSERT INTO raai_apprendre.compte (id, email, nom, prenom, actif)
     VALUES ($1,$2,$3,$4,true)
     ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, actif = true`,
    [userId, email, a.nom, a.prenom],
  )
  const etabId = a.portee === 'etablissement' ? etab.id : null
  // La contrainte d'unicité ne joue pas quand etablissement_id ou academie_id
  // est NULL (deux NULL ne sont jamais égaux en SQL) : on cherche avant d'insérer.
  let membre = (await q(
    `SELECT id FROM raai_apprendre.membre
     WHERE compte_id = $1 AND role = $2::raai_apprendre.role AND etablissement_id IS NOT DISTINCT FROM $3 AND academie_id IS NULL
     ORDER BY cree_le LIMIT 1`,
    [userId, a.role, etabId],
  ))[0]
  if (membre) {
    await q(`UPDATE raai_apprendre.membre SET expire_le = NULL WHERE id = $1`, [membre.id])
    // Les doublons laissés par les anciennes exécutions : leurs affectations
    // rejoignent la ligne conservée avant qu'ils ne disparaissent.
    await q(
      `UPDATE raai_apprendre.affectation SET membre_id = $4
       WHERE membre_id IN (
         SELECT id FROM raai_apprendre.membre
         WHERE compte_id = $1 AND role = $2::raai_apprendre.role AND etablissement_id IS NOT DISTINCT FROM $3 AND academie_id IS NULL AND id <> $4)`,
      [userId, a.role, etabId, membre.id],
    )
    await q(
      `DELETE FROM raai_apprendre.membre
       WHERE compte_id = $1 AND role = $2::raai_apprendre.role AND etablissement_id IS NOT DISTINCT FROM $3 AND academie_id IS NULL AND id <> $4`,
      [userId, a.role, etabId, membre.id],
    )
  } else {
    membre = (await q(
      `INSERT INTO raai_apprendre.membre (id, compte_id, etablissement_id, role)
       VALUES ($1,$2,$3,$4::raai_apprendre.role) RETURNING id`,
      [randomUUID(), userId, etabId, a.role],
    ))[0]
  }
  if (a.role === 'enseignant' && classe) {
    const deja = await q(`SELECT 1 FROM raai_apprendre.affectation WHERE membre_id = $1 AND classe_id = $2`, [membre.id, classe.id])
    if (!deja.length) await q(`INSERT INTO raai_apprendre.affectation (id, membre_id, classe_id) VALUES ($1,$2,$3)`, [randomUUID(), membre.id, classe.id])
  }
  // Vérification : la connexion telle que le site la fait (clé anonyme,
  // e-mail + mot de passe). Si elle échoue ici, elle échouera à l'écran.
  const verification = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const essai = await verification.auth.signInWithPassword({ email, password: mdp })
  const etat = essai.error ? `ÉCHEC : ${essai.error.message}` : 'connexion vérifiée'
  if (!essai.error) await verification.auth.signOut()
  resultats.push({ type: a.role, page: '/connexion-formateur', identifiant: email, secret: mdp, etat })
}

// --- Élève : identifiant + code à 4 chiffres ---------------------------------
const identifiant = `eleve.${etab.uai.toLowerCase()}`
const code = code4()
const eleve = (await q(`SELECT id FROM raai_apprendre.apprenant WHERE identifiant = $1`, [identifiant]))[0]
let eleveId = eleve?.id
if (eleveId) {
  await q(`UPDATE raai_apprendre.apprenant SET code_hash = $2, actif = true WHERE id = $1`, [eleveId, await bcrypt.hash(code, 10)])
} else {
  eleveId = randomUUID()
  await q(
    `INSERT INTO raai_apprendre.apprenant (id, etablissement_id, prenom, initiale_nom, identifiant, code_hash)
     VALUES ($1,$2,'Élève','E',$3,$4)`,
    [eleveId, etab.id, identifiant, await bcrypt.hash(code, 10)],
  )
}
if (classe) {
  const inscrit = await q(`SELECT 1 FROM raai_apprendre.inscription WHERE apprenant_id = $1 AND classe_id = $2`, [eleveId, classe.id])
  if (!inscrit.length) {
    await q(
      `INSERT INTO raai_apprendre.inscription (id, apprenant_id, classe_id, etablissement_id, debut, statut)
       VALUES ($1,$2,$3,$4,current_date,'active')`,
      [randomUUID(), eleveId, classe.id, etab.id],
    )
  }
}
resultats.push({ type: 'eleve', page: '/connexion', identifiant, secret: code })
await bd.end()

console.log(`\nÉtablissement : ${etab.nom} (UAI ${etab.uai})`)
console.log(classe ? `Classe : ${classe.nom} (code de rattachement ${classe.code_rattachement})` : `Aucune classe : l'enseignant et l'élève n'y sont pas rattachés.`)
console.log("\nComptes d'essai — à noter maintenant, rien n'est conservé :\n")
for (const r of resultats) console.log(`  ${r.type.padEnd(24)} ${r.page.padEnd(22)} ${r.identifiant.padEnd(44)} ${r.secret.padEnd(20)} ${r.etat ?? ''}`)
