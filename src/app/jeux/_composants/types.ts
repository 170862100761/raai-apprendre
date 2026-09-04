/**
 * Formes des jeux, partagées entre le chargeur serveur et les composants
 * client. Les clés courtes (`text`, `choices`, `s`, `v`, `sym`, `f`, `d`…)
 * sont celles des fichiers rédigés à la main dans `contenu/jeux/` : on ne les
 * renomme pas, pour que les rédacteurs et le code parlent le même fichier.
 */

export type Mecanique = 'quiz' | 'vraifaux' | 'memory' | 'assoc' | 'chrono'

export type Difficulte = 'Facile' | 'Moyen' | 'Difficile'

export interface QuestionQuiz {
  text: string
  choices: string[]
  answer: number
  /** Pourquoi c'est la bonne réponse : affiché après le choix, juste ou faux. */
  e?: string | undefined
}

export interface Affirmation {
  s: string
  v: boolean
  e: string
}

export interface Paire {
  sym: string
  name: string
}

export interface Formule {
  f: string
  d: string
}

export interface QuestionChrono {
  /** Le libellé mis en avant sur la carte : la cote, la panne, la pièce… */
  display: string
  prompt: string
  c: string[]
  a: number
  e: string
}

interface Socle {
  cle: string
  slug: string
  nom: string
  titre: string
  difficulte: Difficulte
  capacites: string[]
}

export type Jeu =
  | (Socle & { mecanique: 'quiz'; donnees: { questions: QuestionQuiz[] } })
  | (Socle & { mecanique: 'vraifaux'; donnees: { statements: Affirmation[] } })
  | (Socle & { mecanique: 'memory'; donnees: { pairs: Paire[] } })
  | (Socle & { mecanique: 'assoc'; donnees: { bank: Formule[] } })
  | (Socle & {
      mecanique: 'chrono'
      chrono: { titre: string; consigne: string; duree: number }
      donnees: { questions: QuestionChrono[] }
    })

export const LIBELLE_MECANIQUE: Record<Mecanique, string> = {
  quiz: 'Quiz éclair',
  vraifaux: 'Vrai ou faux',
  memory: 'Memory',
  assoc: 'Association',
  chrono: 'Défi chronométré',
}
