/**
 * Extraction de l'arbre d'un référentiel DGER depuis un PDF ChloroFil.
 *
 * Déterministe, sans IA : l'arbre principal s'extrait par expressions
 * régulières. C'est reproductible, gratuit et auditable — trois propriétés que
 * n'a pas une extraction par modèle. L'IA n'intervient qu'en repli sur les
 * tableaux de savoirs, qui sont la vraie difficulté (voir doc 12 §5).
 *
 * Ce module ne fait qu'extraire. Il n'écrit rien en base : un référentiel faux
 * corromprait le suivi de compétences de milliers d'élèves, donc rien n'entre
 * sans validation humaine.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

/** Une capacité de rang 1 : « C5- Correspondant au bloc de compétence B5 : … » */
const RANG1 =
  /^C(\d+)\s*-?\s*(?:[Cc]orrespondant\s+au\s+bloc\s+de\s+compétences?\s*B(\d+)\s*:)?\s*(.*)$/
const RANG2 = /^C(\d+)\.(\d+)\s+(.*)$/

/** Lignes de mise en page à écarter avant toute analyse. */
const BRUIT = [
  /^Page\s+\d+\s+sur\s+\d+$/,
  /^Capacités\s+(générales|professionnelles)$/,
  /^\d+$/,
  /\.{4,}\s*\d*$/, // entrées de sommaire
]

/**
 * Une continuation d'intitulé commence par une minuscule. Mais un paragraphe
 * explicatif aussi — c'est ce qui contaminait l'intitulé de C4.3 dans le
 * prototype. Deux gardes : la longueur, et le vocabulaire de glose.
 */
const MOTS_DE_GLOSE =
  /\b(référence aux|elles précisent|une capacité exprime|les capacités ne couvrent|c'est-à-dire)\b/i

function estContinuation(ligne, intituleCourant) {
  if (!/^[a-zà-ÿ(«]/.test(ligne)) return false
  if (ligne.length > 90) return false
  if (MOTS_DE_GLOSE.test(ligne)) return false
  if (intituleCourant.length > 220) return false
  return true
}

export function texteDuPdf(cheminPdf) {
  return execFileSync('pdftotext', ['-layout', '-enc', 'UTF-8', cheminPdf, '-'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
}

export function empreinte(cheminPdf) {
  return createHash('sha256').update(readFileSync(cheminPdf)).digest('hex')
}

/**
 * La référence d'arrêté se lit dans le CONTENU, jamais dans le nom du fichier :
 * sur ChloroFil, `bac-pro-ae-ref-en-vigueur.pdf` contient l'arrêté de 2010
 * alors que celui de 2023 s'applique (doc 12 §2).
 */
export function lireArrete(texte) {
  const trouves = [
    ...texte.matchAll(
      /arrêté\s+du\s+(\d{1,2}(?:er)?\s+[a-zà-ÿ]+\s+\d{4})/gi,
    ),
  ].map((m) => `Arrêté du ${m[1]}`)

  return {
    // Le premier cité est celui de création ; les suivants le modifient.
    principal: trouves[0] ?? null,
    tous: [...new Set(trouves)],
  }
}

export function extraireArbre(texte) {
  const lignes = texte.split('\n')

  // Le sommaire répète les intitulés : on ne travaille qu'après le titre de
  // section réel, reconnu à l'absence de points de conduite.
  const debut = lignes.findIndex(
    (l) => /Liste des capacités attestées/.test(l) && !/\.{4}/.test(l),
  )
  if (debut === -1) {
    throw new Error(
      "Section « Liste des capacités attestées par le diplôme » introuvable. " +
        "Mise en page inattendue : à traiter en saisie assistée plutôt qu'en échec silencieux.",
    )
  }

  const finBrute = lignes.findIndex(
    (l, i) => i > debut && /Blocs de compétences et capacités/.test(l),
  )
  const zone = lignes.slice(debut + 1, finBrute === -1 ? lignes.length : finBrute)

  const capacites = []
  let courante = null
  let cible = null

  for (const brute of zone) {
    const ligne = brute.trim()
    if (!ligne || BRUIT.some((r) => r.test(ligne))) continue

    const m2 = RANG2.exec(ligne)
    if (m2) {
      if (!courante) continue
      cible = { code: `C${m2[1]}.${m2[2]}`, intitule: m2[3] }
      courante.sousCapacites.push(cible)
      continue
    }

    const m1 = RANG1.exec(ligne)
    if (m1) {
      courante = {
        code: `C${m1[1]}`,
        codeBloc: m1[2] ? `B${m1[2]}` : null,
        intitule: m1[3],
        // Une capacité sans bloc numéroté est le module d'adaptation
        // professionnelle : son contenu est défini régionalement.
        adaptableLocalement: !m1[2],
        sousCapacites: [],
      }
      capacites.push(courante)
      cible = courante
      continue
    }

    if (cible && estContinuation(ligne, cible.intitule)) {
      cible.intitule += ' ' + ligne
    }
  }

  const propre = (s) => s.replace(/\s+/g, ' ').replace(/\s+([:;,.])/g, '$1').trim()
  for (const c of capacites) {
    c.intitule = propre(c.intitule)
    for (const s of c.sousCapacites) s.intitule = propre(s.intitule)
  }

  return capacites
}

/**
 * Contrôles de cohérence. Ils ne bloquent pas l'import — ils alimentent l'écran
 * de validation humaine, à qui revient la décision.
 */
export function verifier(capacites, arrete) {
  const alertes = []

  if (capacites.length === 0) alertes.push('Aucune capacité extraite.')

  // Constaté sur le Bac Pro Agroéquipement : le PDF publié ne cite pas son
  // propre arrêté. La référence doit alors être saisie et confrontée à la
  // fiche diplôme — c'est précisément le cas où un import automatique
  // silencieux rattacherait la version au mauvais arrêté.
  if (arrete && !arrete.principal) {
    alertes.push(
      "Aucun arrêté cité dans le document : à saisir à la main depuis la fiche " +
        'ChloroFil du diplôme. Ne pas déduire la version du nom de fichier.',
    )
  }

  for (const c of capacites) {
    if (c.intitule.length < 10) {
      alertes.push(`${c.code} : intitulé suspect (« ${c.intitule} »).`)
    }
    if (c.intitule.length > 200) {
      alertes.push(`${c.code} : intitulé anormalement long, probable contamination.`)
    }
    for (const s of c.sousCapacites) {
      if (!s.code.startsWith(c.code + '.')) {
        alertes.push(`${s.code} rattachée à ${c.code} : numérotation incohérente.`)
      }
    }
  }

  const codes = capacites.map((c) => c.code)
  if (new Set(codes).size !== codes.length) alertes.push('Codes de capacité en doublon.')

  const sansBloc = capacites.filter((c) => !c.codeBloc)
  if (sansBloc.length > 1) {
    alertes.push(
      `${sansBloc.length} capacités sans bloc (${sansBloc.map((c) => c.code).join(', ')}). ` +
        `Une seule est attendue : le module d'adaptation professionnelle.`,
    )
  }

  return alertes
}

export function extraireReferentiel(cheminPdf) {
  const texte = texteDuPdf(cheminPdf)
  const capacites = extraireArbre(texte)
  const arrete = lireArrete(texte)

  return {
    empreinteSource: empreinte(cheminPdf),
    arrete,
    capacites,
    alertes: verifier(capacites, arrete),
    statistiques: {
      capacites: capacites.length,
      sousCapacites: capacites.reduce((n, c) => n + c.sousCapacites.length, 0),
    },
  }
}
