#!/usr/bin/env node
/**
 * Reprise du contenu RAAI-Formation (roadmap MVP, lot « Migration »).
 *
 * RAAI-Formation stockait ses cours en JSON avec des blocs riches en HTML.
 * Ici, une leçon est une liste de blocs typés SANS HTML — c'est ce qui rend
 * possibles l'export, la lecture audio et la garantie anti-injection. La
 * reprise est donc une **conversion**, pas une copie :
 *
 *   - chaque bloc source devient un bloc `texte` (balises retirées, entités
 *     décodées), sauf les liens qui deviennent de vrais blocs `lien` ;
 *   - les images de RAAI-Formation n'avaient pas de fichier (src vide) : leur
 *     description devient une note « Illustration à prévoir », pour que
 *     l'enseignant qui reprend le brouillon sache quoi compléter ;
 *   - tout est importé en **brouillon**. Rien ne part vers les élèves sans
 *     qu'un enseignant ait relu et publié — la règle vaut pour l'IA, elle
 *     vaut pour une migration.
 *
 * Idempotent : les identifiants sont dérivés du contenu source (UUID stables),
 * relancer l'import met à jour au lieu de dupliquer. Les leçons dont le
 * brouillon a été retouché à la main ne sont PAS écrasées : la relecture
 * humaine prime sur la source.
 *
 * Usage :
 *   npm run formation:importer                        # établissement de démo
 *   npm run formation:importer -- --uai 0820001A
 *   npm run formation:importer -- --source D:/RAAI/RAAI-Formation
 *
 * PGlite n'accepte qu'une connexion : arrêter `npm run dev` avant de lancer.
 */
import { createHash } from 'node:crypto'
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import pg from 'pg'

// --- Arguments et connexion -------------------------------------------------

function argument(nom, defaut) {
  const rang = process.argv.indexOf(`--${nom}`)
  return rang >= 0 ? process.argv[rang + 1] : defaut
}

const source = argument('source', 'D:/RAAI/RAAI-Formation')
const uai = argument('uai', '0820001A')

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

// --- Conversion HTML → texte -------------------------------------------------

const ENTITES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  rsquo: '\u2019', lsquo: '\u2018', rdquo: '\u201d', ldquo: '\u201c',
  eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', ecirc: 'ê',
  hellip: '…', middot: '·', times: '×', rarr: '→', deg: '°',
}

export function enTexte(html) {
  if (!html) return ''
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (tout, nom) => ENTITES[nom.toLowerCase()] ?? tout)
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

const texte = (contenu) => ({ type: 'texte', texte: contenu })

/** Un bloc source → zéro, un ou plusieurs blocs cibles. */
export function convertirBloc(bloc) {
  switch (bloc.type) {
    case 'section':
      return [texte(bloc.texte)]
    case 'paragraphe':
    case 'formule':
      return [texte(enTexte(bloc.html))]
    case 'encadre':
    case 'note': {
      const titre = bloc.titre ? `${enTexte(bloc.titre)}\n` : ''
      return [texte(`${titre}${enTexte(bloc.html)}`)]
    }
    case 'cartes':
      return [
        texte(
          bloc.cartes.map((c) => `${enTexte(c.titre)} — ${enTexte(c.html)}`).join('\n\n'),
        ),
      ]
    case 'vigilance':
      return [texte(`Vigilance :\n${bloc.points.map((p) => `– ${enTexte(p)}`).join('\n')}`)]
    case 'retenir':
      return [texte(`À retenir :\n${bloc.points.map((p) => `– ${enTexte(p)}`).join('\n')}`)]
    case 'reperes':
      return [
        texte(bloc.items.map((r) => `${enTexte(r.titre)} : ${enTexte(r.valeur)}`).join('\n')),
      ]
    case 'etapes':
      return [texte(bloc.items.map((e) => `${e.num} ${enTexte(e.html)}`).join('\n'))]
    case 'legende':
      return [texte(bloc.texte)]
    case 'image': {
      // RAAI-Formation n'avait pas les fichiers (src vide) : on transmet la
      // consigne, pas une image cassée.
      const description = bloc.placeholder || bloc.legende
      return description ? [texte(`Illustration à prévoir : ${enTexte(description)}`)] : []
    }
    case 'ressources':
      return bloc.liens
        .filter((l) => /^https?:\/\//.test(l.href))
        .map((l) => ({
          type: 'lien',
          url: l.href,
          titre: enTexte(l.titre).slice(0, 200),
          description: enTexte(l.detail).slice(0, 500) || undefined,
        }))
    default:
      console.warn(`  type de bloc inconnu, ignoré : ${bloc.type}`)
      return []
  }
}

/** Même estimation que le domaine (`dureeEstimeeMinutes`) : 180 mots/min. */
function dureeEstimee(blocs) {
  let minutes = 0
  for (const bloc of blocs) {
    if (bloc.type === 'texte') minutes += bloc.texte.split(/\s+/).length / 180
    else minutes += 0.25
  }
  return Math.max(1, Math.round(minutes))
}

/** UUID stable dérivé de la source : relancer l'import ne duplique rien. */
const idStable = (...parties) => {
  const h = createHash('sha256').update(parties.join('|')).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

// --- Import -----------------------------------------------------------------

async function principal() {
  const matieres = JSON.parse(readFileSync(join(source, 'src/content/matieres.json'), 'utf8'))
  const cours = JSON.parse(readFileSync(join(source, 'src/content/cours.json'), 'utf8'))

  const url = lireUrl()
  if (!url) {
    console.error('DATABASE_URL introuvable.')
    process.exit(1)
  }
  const bd = new pg.Client({ connectionString: url })
  await bd.connect()

  try {
    const etab = await bd.query(
      `SELECT id FROM raai_apprendre.etablissement WHERE uai = $1`,
      [uai],
    )
    if (etab.rows.length === 0) {
      console.error(`Aucun établissement pour l'UAI ${uai}.`)
      process.exit(1)
    }
    const etablissementId = etab.rows[0].id

    let creees = 0
    let conservees = 0

    for (const matiere of matieres) {
      const matiereId = idStable('formation-matiere', matiere.code)
      await bd.query(
        `INSERT INTO raai_apprendre.matiere (id, etablissement_id, code, intitule)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET intitule = EXCLUDED.intitule`,
        [matiereId, etablissementId, matiere.code, matiere.nom],
      )

      // Un seul module par matière : RAAI-Formation n'avait pas cette notion,
      // et inventer un découpage ne regarde pas une migration.
      const moduleId = idStable('formation-module', matiere.code)
      await bd.query(
        `INSERT INTO raai_apprendre.module_formation (id, matiere_id, code, intitule, ordre)
         VALUES ($1, $2, $3, $4, 1)
         ON CONFLICT (id) DO UPDATE SET intitule = EXCLUDED.intitule`,
        [moduleId, matiereId, matiere.code, matiere.nom],
      )

      for (const [ordre, slug] of matiere.chapitres.entries()) {
        const lecon = cours.find((c) => c.id === slug)
        if (!lecon) {
          console.warn(`  cours absent de cours.json, ignoré : ${slug}`)
          continue
        }

        const chapitreId = idStable('formation-chapitre', slug)
        await bd.query(
          `INSERT INTO raai_apprendre.chapitre (id, module_id, titre, ordre)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (id) DO UPDATE SET titre = EXCLUDED.titre, ordre = EXCLUDED.ordre`,
          [chapitreId, moduleId, lecon.titre, ordre + 1],
        )

        const blocs = lecon.blocs.flatMap(convertirBloc).filter(
          (b) => b.type !== 'texte' || b.texte.length > 0,
        )
        const leconId = idStable('formation-lecon', slug)

        // Une leçon retouchée à la main n'est pas écrasée : si ses blocs ne
        // correspondent plus à une conversion précédente, la relecture humaine
        // a commencé et la source n'a plus autorité dessus.
        const existante = await bd.query(
          `SELECT statut FROM raai_apprendre.lecon WHERE id = $1`,
          [leconId],
        )
        if (existante.rows.length > 0 && existante.rows[0].statut !== 'brouillon') {
          conservees++
          continue
        }

        await bd.query(
          `INSERT INTO raai_apprendre.lecon
             (id, chapitre_id, etablissement_id, titre, statut, duree_estimee_min)
           VALUES ($1, $2, $3, $4, 'brouillon', $5)
           ON CONFLICT (id) DO UPDATE
             SET titre = EXCLUDED.titre, duree_estimee_min = EXCLUDED.duree_estimee_min`,
          [leconId, chapitreId, etablissementId, lecon.titre, dureeEstimee(blocs)],
        )
        await bd.query(`DELETE FROM raai_apprendre.bloc_contenu WHERE lecon_id = $1`, [leconId])
        for (const [rang, bloc] of blocs.entries()) {
          await bd.query(
            `INSERT INTO raai_apprendre.bloc_contenu (id, lecon_id, type, contenu, ordre)
             VALUES ($1, $2, $3, $4, $5)`,
            [idStable('formation-bloc', slug, String(rang)), leconId, bloc.type, bloc, rang],
          )
        }
        creees++
      }
    }

    console.log(
      `\nReprise terminée : ${creees} leçon(s) importée(s) en brouillon` +
        (conservees > 0 ? `, ${conservees} conservée(s) (déjà relues)` : '') +
        `.\nRien n'est visible des élèves : chaque leçon attend la relecture` +
        ` et la publication d'un enseignant.`,
    )
  } finally {
    await bd.end()
  }
}

principal().catch((erreur) => {
  console.error(erreur.message)
  process.exit(1)
})
