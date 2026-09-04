import 'server-only'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import type { Jeu, Mecanique } from './_composants/types'

/**
 * Les jeux vivent dans `contenu/jeux/*.json`, écrits par des rédacteurs, et
 * sont lus au build : pas de table, pas de RLS à écrire pour du contenu
 * national qui ne porte aucune donnée d'élève.
 *
 * Un fichier mal formé est refusé avec son nom et la raison, plutôt que de
 * planter un élève en pleine partie sur un `undefined`.
 */

const DOSSIER = join(process.cwd(), 'contenu', 'jeux')

const quatreChoix = z.array(z.string().min(1)).length(4)

const socle = z.object({
  cle: z.string().regex(/^[a-z0-9-]+$/, 'minuscules et tirets seulement'),
  slug: z.string().regex(/^[a-z0-9-]+$/, 'minuscules et tirets seulement'),
  nom: z.string().min(1),
  titre: z.string().min(1),
  difficulte: z.enum(['Facile', 'Moyen', 'Difficile']),
  capacites: z.array(z.string()).default([]),
})

const schemaJeu: z.ZodType<Jeu, z.ZodTypeDef, unknown> = z.discriminatedUnion('mecanique', [
  socle.extend({
    mecanique: z.literal('quiz'),
    donnees: z.object({
      questions: z
        .array(
          z.object({
            text: z.string().min(1),
            choices: quatreChoix,
            answer: z.number().int().min(0).max(3),
            e: z.string().optional(),
          }),
        )
        .min(1),
    }),
  }),
  socle.extend({
    mecanique: z.literal('vraifaux'),
    donnees: z.object({
      statements: z
        .array(z.object({ s: z.string().min(1), v: z.boolean(), e: z.string() }))
        .min(1),
    }),
  }),
  socle.extend({
    mecanique: z.literal('memory'),
    donnees: z.object({
      // Le symbole doit tenir sur une carte : au-delà de 6 caractères, il déborde.
      pairs: z
        .array(z.object({ sym: z.string().min(1).max(6), name: z.string().min(1) }))
        .min(2),
    }),
  }),
  socle.extend({
    mecanique: z.literal('assoc'),
    donnees: z.object({
      // Une manche tire six entrées : moins, et le tirage n'a plus de sens.
      bank: z.array(z.object({ f: z.string().min(1), d: z.string().min(1) })).min(6),
    }),
  }),
  socle.extend({
    mecanique: z.literal('chrono'),
    chrono: z.object({
      titre: z.string().min(1),
      consigne: z.string().min(1),
      duree: z.number().positive(),
    }),
    donnees: z.object({
      questions: z
        .array(
          z.object({
            display: z.string().min(1),
            prompt: z.string().min(1),
            c: quatreChoix,
            a: z.number().int().min(0).max(3),
            e: z.string(),
          }),
        )
        .min(1),
    }),
  }),
])

function lireDossier(): Jeu[] {
  let fichiers: string[]
  try {
    fichiers = readdirSync(DOSSIER).filter((f) => f.endsWith('.json'))
  } catch {
    // Pas encore de dossier : la section existe, vide. Les rédacteurs y écrivent.
    return []
  }

  const jeux = fichiers.map((fichier) => {
    const brut: unknown = JSON.parse(readFileSync(join(DOSSIER, fichier), 'utf8'))
    const resultat = schemaJeu.safeParse(brut)
    if (!resultat.success) {
      const detail = resultat.error.issues
        .map((i) => `${i.path.join('.') || '(racine)'} : ${i.message}`)
        .join(' ; ')
      throw new Error(`contenu/jeux/${fichier} est mal formé — ${detail}`)
    }
    return resultat.data
  })

  // Le slug est l'adresse, la clé est le score : un doublon sur l'un ou l'autre
  // ferait jouer deux jeux au même endroit ou compter deux scores ensemble.
  for (const champ of ['slug', 'cle'] as const) {
    const vus = new Set<string>()
    for (const j of jeux) {
      if (vus.has(j[champ])) throw new Error(`contenu/jeux : ${champ} « ${j[champ]} » en double`)
      vus.add(j[champ])
    }
  }

  return jeux.sort((a, b) => a.titre.localeCompare(b.titre, 'fr'))
}

let memo: Jeu[] | null = null

export function listerJeux(): Jeu[] {
  memo ??= lireDossier()
  return memo
}

export function jeu(slug: string): Jeu | null {
  return listerJeux().find((j) => j.slug === slug) ?? null
}

/** Ordre d'affichage des groupes sur la page de liste. */
export const ORDRE_MECANIQUES: Mecanique[] = ['quiz', 'vraifaux', 'chrono', 'memory', 'assoc']
