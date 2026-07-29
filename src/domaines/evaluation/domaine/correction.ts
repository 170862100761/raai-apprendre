/**
 * La correction humaine : ce qu'un enseignant a le droit de mettre, et quand.
 *
 * `corrigerTentative` laisse à `null` le score des questions rédigées et pose la
 * tentative en `attente_correction`. Ce fichier est l'autre bout : il reprend
 * une copie dans cet état et décide si elle peut en sortir.
 *
 * Tout est pur. La règle « une note hors barème est refusée » ne doit pas
 * dépendre d'un aller-retour en base pour se vérifier.
 */
import { echec, succes, type Resultat } from '@/noyau/resultat'
import type { IdentifiantTentative } from '@/noyau/identifiants'
import type { StatutTentative } from './tentative'

/** Ce que l'enseignant saisit pour une question. */
export type NoteEnseignant = {
  readonly questionId: string
  readonly score: number
  /** Vide accepté, mais voir `sansRetour` : une note nue n'apprend rien. */
  readonly commentaire: string
}

/** Une question de la copie, telle qu'elle est en base au moment de corriger. */
export type QuestionDeLaCopie = {
  readonly questionId: string
  readonly bareme: number
  /** `null` = attend l'enseignant. Non nul = déjà tranché, automatiquement. */
  readonly score: number | null
}

export type CopieACorriger = {
  readonly tentativeId: IdentifiantTentative
  readonly statut: StatutTentative
  readonly questions: readonly QuestionDeLaCopie[]
}

export type CopieCorrigee = {
  readonly tentativeId: IdentifiantTentative
  /** Total de la copie, correction automatique et humaine confondues. */
  readonly score: number
  readonly scoreMax: number
  readonly statut: StatutTentative
  /** Ce qu'il reste à noter. Vide = la copie est close. */
  readonly restantes: readonly string[]
  readonly notes: readonly NoteEnseignant[]
}

/**
 * Une note est-elle dans le barème ?
 *
 * Le cas qu'on protège n'est pas la malveillance mais la faute de frappe : 20
 * saisi sur une question qui en vaut 2 ne lève rien, ne se voit pas, et gonfle
 * un total que personne ne recalculera. Une note négative, de même, ferait
 * baisser le score des autres questions.
 */
export function noteRecevable(score: number, bareme: number): boolean {
  return Number.isFinite(score) && score >= 0 && score <= bareme
}

/**
 * Une note sans commentaire sur une question rédigée.
 *
 * Ce n'est pas une erreur — on ne bloque pas un enseignant qui corrige trente
 * copies un dimanche soir. Mais l'appelant peut le signaler : sur une réponse
 * rédigée, « 1,5 / 3 » sans un mot n'apprend rien à l'élève, et c'est
 * exactement ce que le passage à l'écrit devait apporter.
 */
export const sansRetour = (note: NoteEnseignant): boolean =>
  note.commentaire.trim().length === 0

/**
 * Applique les notes d'un enseignant à une copie.
 *
 * Refuse plutôt que de corriger silencieusement : une note hors barème est une
 * saisie à reprendre, pas une valeur à écrêter. Écrêter donnerait un 2/2 là où
 * l'enseignant croit avoir mis 20, et l'écart ne se verrait jamais.
 *
 * La copie ne devient `corrigee` que lorsqu'il ne reste plus rien à noter. Une
 * correction partielle est un cas normal — on s'interrompt, on reprend — et
 * elle laisse la copie en attente.
 */
export function appliquerNotes(
  copie: CopieACorriger,
  notes: readonly NoteEnseignant[],
): Resultat<CopieCorrigee> {
  // Une tentative corrigée est immuable (cf. en-tête de `tentative.ts`) :
  // réviser une note crée une nouvelle tentative liée à la précédente. Sans
  // ce refus, une note change sans trace et plus personne ne peut répondre à
  // « pourquoi ai-je eu 12 ? ».
  if (copie.statut !== 'attente_correction') {
    return echec(
      'conflit',
      copie.statut === 'corrigee'
        ? 'Cette copie est déjà corrigée. Pour revenir dessus, ouvre une révision.'
        : "Cette copie n'attend pas de correction.",
    )
  }

  const parId = new Map(copie.questions.map((q) => [q.questionId, q]))
  const champs: Record<string, string> = {}

  for (const note of notes) {
    const question = parId.get(note.questionId)
    if (!question) {
      champs[note.questionId] = 'Question absente de cette copie.'
      continue
    }
    // Renoter ce que la machine a déjà tranché n'est pas une correction, c'est
    // une révision — et elle passe par une nouvelle tentative.
    if (question.score !== null) {
      champs[note.questionId] = 'Cette question a déjà été corrigée automatiquement.'
      continue
    }
    if (!noteRecevable(note.score, question.bareme)) {
      champs[note.questionId] = `La note doit être comprise entre 0 et ${question.bareme}.`
    }
  }

  if (Object.keys(champs).length > 0) {
    return echec('donnees_invalides', 'Certaines notes ne sont pas recevables.', champs)
  }

  const notees = new Map(notes.map((n) => [n.questionId, n.score]))
  const restantes = copie.questions
    .filter((q) => q.score === null && !notees.has(q.questionId))
    .map((q) => q.questionId)

  const score = copie.questions.reduce(
    (total, q) => total + (q.score ?? notees.get(q.questionId) ?? 0),
    0,
  )

  return succes({
    tentativeId: copie.tentativeId,
    score: arrondir(score),
    scoreMax: arrondir(copie.questions.reduce((total, q) => total + q.bareme, 0)),
    statut: restantes.length === 0 ? 'corrigee' : 'attente_correction',
    restantes,
    notes,
  })
}

/** Deux décimales, comme la correction automatique : au-delà, c'est du bruit. */
const arrondir = (valeur: number) => Math.round(valeur * 100) / 100
