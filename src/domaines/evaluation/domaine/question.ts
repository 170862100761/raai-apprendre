/**
 * Les questions et leur correction.
 *
 * Deux structures distinctes par question, et cette séparation est le cœur du
 * module : l'**énoncé** part chez l'élève, le **corrigé** ne sort jamais avant
 * soumission. Les mélanger dans un seul objet, c'est garantir qu'un jour l'un
 * partira avec l'autre.
 */
import { z } from 'zod'

// --- Énoncés ---------------------------------------------------------------

const Qcm = z.object({
  type: z.literal('qcm'),
  /** Plusieurs bonnes réponses possibles : c'est le cas courant en technique. */
  propositions: z.array(z.string().min(1)).min(2).max(10),
})

const VraiFaux = z.object({ type: z.literal('vrai_faux') })

const Numerique = z.object({
  type: z.literal('numerique'),
  unite: z.string().max(20).optional(),
})

const TexteCourt = z.object({ type: z.literal('texte_court') })

/** Corrigé humain : aucune correction automatique n'est tentée. */
const TexteLong = z.object({ type: z.literal('texte_long') })

const Appariement = z.object({
  type: z.literal('appariement'),
  gauche: z.array(z.string().min(1)).min(2).max(10),
  droite: z.array(z.string().min(1)).min(2).max(10),
})

export const SchemaEnonce = z.discriminatedUnion('type', [
  Qcm,
  VraiFaux,
  Numerique,
  TexteCourt,
  TexteLong,
  Appariement,
])

export type Enonce = z.infer<typeof SchemaEnonce>
export type TypeQuestion = Enonce['type']

// --- Corrigés --------------------------------------------------------------

export const SchemaCorrige = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('qcm'),
    /** Index des propositions correctes. */
    bonnes: z.array(z.number().int().min(0)).min(1),
  }),
  z.object({ type: z.literal('vrai_faux'), bonne: z.boolean() }),
  z.object({
    type: z.literal('numerique'),
    valeur: z.number(),
    /**
     * Tolérance absolue. En technique, exiger l'égalité stricte sanctionne
     * l'arrondi, pas la compréhension : 18 kW et 18,0 kW valent la même chose.
     */
    tolerance: z.number().min(0).default(0),
  }),
  z.object({
    type: z.literal('texte_court'),
    /** Plusieurs formulations acceptées. */
    acceptees: z.array(z.string().min(1)).min(1),
  }),
  z.object({ type: z.literal('texte_long') }),
  z.object({
    type: z.literal('appariement'),
    /** Index de droite attendu pour chaque entrée de gauche. */
    couples: z.array(z.number().int().min(0)).min(2),
  }),
])

export type Corrige = z.infer<typeof SchemaCorrige>

// --- Réponses --------------------------------------------------------------

export const SchemaReponse = z.discriminatedUnion('type', [
  z.object({ type: z.literal('qcm'), choisies: z.array(z.number().int().min(0)) }),
  z.object({ type: z.literal('vrai_faux'), valeur: z.boolean() }),
  z.object({ type: z.literal('numerique'), valeur: z.number() }),
  z.object({ type: z.literal('texte_court'), texte: z.string().max(500) }),
  z.object({ type: z.literal('texte_long'), texte: z.string().max(20_000) }),
  z.object({ type: z.literal('appariement'), couples: z.array(z.number().int().min(0)) }),
])

export type Reponse = z.infer<typeof SchemaReponse>

export const lireEnonce = (brut: unknown): Enonce | null => {
  const r = SchemaEnonce.safeParse(brut)
  return r.success ? r.data : null
}

export const lireCorrige = (brut: unknown): Corrige | null => {
  const r = SchemaCorrige.safeParse(brut)
  return r.success ? r.data : null
}

export const lireReponse = (brut: unknown): Reponse | null => {
  const r = SchemaReponse.safeParse(brut)
  return r.success ? r.data : null
}

// --- Correction ------------------------------------------------------------

export type Appreciation =
  | { readonly type: 'automatique'; readonly part: number }
  /** Attend un enseignant : aucune note n'est inventée. */
  | { readonly type: 'humaine' }

/**
 * Part de barème obtenue, entre 0 et 1.
 *
 * Pure et sans effet de bord : c'est ce qui permet de la tester sans base et de
 * la rejouer à l'identique en cas de contestation.
 */
export function corriger(corrige: Corrige, reponse: Reponse): Appreciation {
  if (corrige.type !== reponse.type) return { type: 'automatique', part: 0 }

  switch (corrige.type) {
    case 'qcm': {
      const attendues = new Set(corrige.bonnes)
      const donnees = new Set((reponse as { choisies: number[] }).choisies)

      // Barème partiel : compter juste ce qui est juste, retirer ce qui est
      // faux. Le tout-ou-rien pousse à ne rien cocher dès qu'on hésite, et
      // n'apprend rien de plus.
      let points = 0
      for (const i of donnees) points += attendues.has(i) ? 1 : -1

      return { type: 'automatique', part: Math.max(0, points / attendues.size) }
    }

    case 'vrai_faux':
      return {
        type: 'automatique',
        part: corrige.bonne === (reponse as { valeur: boolean }).valeur ? 1 : 0,
      }

    case 'numerique': {
      const ecart = Math.abs(corrige.valeur - (reponse as { valeur: number }).valeur)
      return { type: 'automatique', part: ecart <= corrige.tolerance ? 1 : 0 }
    }

    case 'texte_court': {
      const donnee = normaliser((reponse as { texte: string }).texte)
      const juste = corrige.acceptees.some((a) => normaliser(a) === donnee)
      return { type: 'automatique', part: juste ? 1 : 0 }
    }

    case 'appariement': {
      const attendus = corrige.couples
      const donnes = (reponse as { couples: number[] }).couples
      const justes = attendus.filter((v, i) => donnes[i] === v).length
      return { type: 'automatique', part: justes / attendus.length }
    }

    case 'texte_long':
      // Corriger automatiquement une réponse rédigée reviendrait à noter au
      // hasard. On l'assume : c'est l'enseignant qui lit.
      return { type: 'humaine' }
  }
}

/**
 * Comparaison indulgente sur la forme, stricte sur le fond.
 *
 * Un élève qui écrit « litres par minute » au lieu de « Litres par Minute » a
 * compris. Un élève qui écrit autre chose n'a pas compris.
 */
function normaliser(texte: string): string {
  return texte
    .trim()
    .toLowerCase()
    .normalize('NFD')
    // Marques diacritiques.
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/, '')
}
