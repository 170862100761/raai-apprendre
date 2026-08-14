/**
 * Production des aperçus 3D en attente.
 *
 * C'est le « job » du doc 02 §5, dans la forme la plus simple qui tienne :
 * une commande qu'on lance. Pas de file de messages, pas d'ordonnanceur —
 * l'un et l'autre demandent une infrastructure que le MVP n'a pas, et un
 * travail de fond qui ne tourne jamais parce qu'il attend son courtier ne vaut
 * mieux qu'un script.
 *
 * Deux usages :
 *
 *   npm run medias:apercus            — traite tout ce qui est en attente
 *   npm run medias:apercus -- --echoues  — reprend aussi les échecs passés
 *
 * Le second existe parce qu'un échec vient souvent de nous : une déflexion mal
 * choisie, une version d'OpenCascade plus ancienne. Rendre la reprise facile
 * évite qu'on aille éditer la base à la main.
 *
 * Idempotent de bout en bout : ce qui a déjà un aperçu n'est pas recalculé.
 */

import { existsSync, readFileSync } from 'node:fs'
import { PrismaClient } from '@prisma/client'
import {
  depotMediathequePrisma,
  preparerApercu3d,
  stockageDisque,
  stockageSupabase,
  tessellateurOcct,
} from '../src/domaines/mediatheque/index'

/**
 * Résolution de `DATABASE_URL`, hors de Next — c'est lui qui charge
 * `.env.local` d'habitude.
 *
 * Les fichiers passent AVANT `process.env`, contrairement à `migrer.mjs`, et
 * c'est délibéré : Prisma charge `.env` de son côté au moment de l'import, donc
 * avant ce code. Consulter l'environnement d'abord reviendrait à lire la valeur
 * que Prisma vient d'y poser, et `.env.local` — qui est ce que l'ordre de
 * priorité de Next fait gagner — ne serait jamais lu.
 *
 * On prend la PREMIÈRE occurrence dans le fichier : il en contient plusieurs,
 * la locale d'abord, là où `--env-file` de Node retiendrait la dernière,
 * c'est-à-dire la production.
 */
function lireVariable(nom: string): string | null {
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
  return process.env[nom] || null
}

const lireUrl = () => lireVariable('DATABASE_URL')

const url = lireUrl()
if (!url) {
  console.error('DATABASE_URL introuvable.')
  process.exit(1)
}
const reprendreEchecs = process.argv.includes('--echoues')

// URL passée explicitement, et non par `process.env` : Prisma charge `.env`
// lui-même au moment de l'import, donc avant que ce fichier ne s'exécute. Une
// affectation à `process.env.DATABASE_URL` arriverait trop tard et le script
// irait taper la base indiquée dans `.env` — en développement, celle qui
// n'existe pas ; ailleurs, une qu'on ne voulait pas toucher.
const prisma = new PrismaClient({ datasourceUrl: url })

async function principal() {
  const statuts = reprendreEchecs
    ? (['en_attente', 'echoue', 'en_cours'] as const)
    : (['en_attente'] as const)

  const enAttente = await prisma.ressource.findMany({
    where: {
      typeMime: 'model/step',
      cheminApercu: null,
      statutTraitement: { in: [...statuts] },
    },
    select: { id: true, nom: true },
    orderBy: { creeLe: 'asc' },
  })

  if (enAttente.length === 0) {
    console.log('Aucun aperçu 3D à produire.')
    return
  }

  console.log(`${enAttente.length} fichier(s) STEP à convertir.`)

  const depot = depotMediathequePrisma(prisma)

  // Même bascule que `app/_stockage.ts` : Supabase configuré, c'est Supabase
  // Storage ; sinon le disque local transitoire.
  const urlSupabase = lireVariable('NEXT_PUBLIC_SUPABASE_URL')
  const cleServiceRole = lireVariable('SUPABASE_SERVICE_ROLE_KEY')
  const stockage =
    urlSupabase && cleServiceRole
      ? stockageSupabase({ url: urlSupabase, cleServiceRole })
      : stockageDisque

  let reussis = 0

  for (const ressource of enAttente) {
    const debut = Date.now()
    // Séquentiel, et c'est voulu : chaque tessellation charge la géométrie
    // entière en mémoire. Trois assemblages en parallèle sur la machine d'un
    // établissement, et c'est le serveur qui tombe.
    const resultat = await preparerApercu3d(ressource.id, {
      depot,
      stockage,
      tessellateur: tessellateurOcct,
    })

    const duree = ((Date.now() - debut) / 1000).toFixed(1)

    if (resultat.ok) {
      reussis += 1
      const ko = Math.round(resultat.valeur.octets / 1024)
      console.log(
        `  ✔ ${ressource.nom} — ${resultat.valeur.triangles} triangles, ` +
          `déflexion ${resultat.valeur.deflexion}, ${ko} ko, ${duree} s`,
      )
    } else {
      // On continue : un fichier qu'on ne sait pas lire ne doit pas bloquer les
      // suivants. Le statut « échoué » garde la trace, et le fichier reste
      // téléchargeable.
      console.error(`  ✖ ${ressource.nom} — ${resultat.erreur.message}`)
    }
  }

  console.log(`${reussis}/${enAttente.length} aperçu(s) produit(s).`)
}

principal()
  .catch((erreur: unknown) => {
    console.error(erreur)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
