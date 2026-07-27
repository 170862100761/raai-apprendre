/**
 * Une leçon n'est pas du HTML : c'est une liste ordonnée de blocs typés.
 *
 * Le HTML libre rendrait impossibles trois choses auxquelles on tient : l'export
 * PDF, la lecture audio, et la garantie qu'aucun contenu d'enseignant ne peut
 * injecter de script chez un élève. Un bloc, lui, se valide, se rend dans
 * n'importe quel format, et se lit à voix haute.
 *
 * Ajouter un type de bloc — simulation, carte interactive, quiz intégré — ne
 * demande aucune migration : seulement un schéma ici et un rendu en face.
 */
import { z } from 'zod'

/**
 * `z.string().url()` accepte `javascript:alert(1)` — c'est une URL valide au
 * sens de la norme. Dans une leçon, c'en est une qu'un élève cliquera.
 * On restreint donc explicitement aux schémas navigables.
 */
const UrlNavigable = z
  .string()
  .url()
  .refine(
    (valeur) => {
      try {
        return ['http:', 'https:'].includes(new URL(valeur).protocol)
      } catch {
        return false
      }
    },
    { message: 'Seuls les liens http et https sont acceptés.' },
  )

/** Texte brut, jamais de balises. Les sauts de ligne font les paragraphes. */
const Texte = z.object({
  type: z.literal('texte'),
  texte: z.string().min(1).max(20_000),
})

const Media = {
  ressourceId: z.string().uuid(),
  /**
   * Obligatoire, et c'est délibéré : sans alternative textuelle, l'image est
   * invisible pour un élève qui utilise un lecteur d'écran, et muette dans un
   * export. Un schéma d'hydraulique sans description ne vaut rien.
   */
  alternative: z.string().min(1).max(500),
  legende: z.string().max(500).optional(),
}

const Image = z.object({ type: z.literal('image'), ...Media })
const Schema_ = z.object({ type: z.literal('schema'), ...Media })

const Video = z.object({
  type: z.literal('video'),
  ressourceId: z.string().uuid(),
  titre: z.string().min(1).max(200),
  /** Sans sous-titres, la vidéo exclut. On l'accepte, on le signale à l'auteur. */
  sousTitresRessourceId: z.string().uuid().optional(),
  dureeSecondes: z.number().int().positive().optional(),
})

const Modele3d = z.object({
  type: z.literal('modele3d'),
  ressourceId: z.string().uuid(),
  titre: z.string().min(1).max(200),
  /**
   * Description obligatoire là aussi : la 3D ne se voit pas sans WebGL, et une
   * partie du parc des établissements n'en a pas.
   */
  description: z.string().min(1).max(1000),
  format: z.enum(['step', 'stl', 'glb']),
})

const Pdf = z.object({
  type: z.literal('pdf'),
  ressourceId: z.string().uuid(),
  titre: z.string().min(1).max(200),
  pages: z.number().int().positive().optional(),
})

const Lien = z.object({
  type: z.literal('lien'),
  url: UrlNavigable,
  titre: z.string().min(1).max(200),
  description: z.string().max(500).optional(),
})

const Bibliographie = z.object({
  type: z.literal('bibliographie'),
  references: z
    .array(
      z.object({
        titre: z.string().min(1).max(300),
        auteur: z.string().max(200).optional(),
        annee: z.number().int().min(1500).max(2200).optional(),
        url: UrlNavigable.optional(),
      }),
    )
    .min(1),
})

const Fichier = z.object({
  type: z.literal('fichier'),
  ressourceId: z.string().uuid(),
  nom: z.string().min(1).max(200),
  /** Formats CAO propriétaires compris : téléchargeables, jamais interprétés. */
  description: z.string().max(500).optional(),
})

export const SchemaBloc = z.discriminatedUnion('type', [
  Texte,
  Image,
  Schema_,
  Video,
  Modele3d,
  Pdf,
  Lien,
  Bibliographie,
  Fichier,
])

export type ContenuBloc = z.infer<typeof SchemaBloc>
export type TypeBloc = ContenuBloc['type']

export type Bloc = {
  readonly id: string
  readonly ordre: number
  readonly contenu: ContenuBloc
  /** Un bloc issu d'une génération ne part pas chez un élève sans validation. */
  readonly genereParIa: boolean
}

/**
 * Valide un contenu venu de la base. Le JSONB peut contenir n'importe quoi —
 * un import raté, une migration, une écriture manuelle — et on refuse d'en
 * déduire du rendu sans vérifier.
 */
export function lireContenu(brut: unknown): ContenuBloc | null {
  const resultat = SchemaBloc.safeParse(brut)
  return resultat.success ? resultat.data : null
}

/** Estimation de lecture. Sert à afficher « 12 min » sur le tableau de bord. */
export function dureeEstimeeMinutes(blocs: readonly Bloc[]): number {
  const MOTS_PAR_MINUTE = 180 // lecture d'un texte technique, pas d'un roman

  let minutes = 0
  for (const bloc of blocs) {
    switch (bloc.contenu.type) {
      case 'texte':
        minutes += bloc.contenu.texte.split(/\s+/).length / MOTS_PAR_MINUTE
        break
      case 'video':
        minutes += (bloc.contenu.dureeSecondes ?? 180) / 60
        break
      case 'modele3d':
        minutes += 2 // manipuler un modèle prend du temps
        break
      case 'image':
      case 'schema':
        minutes += 0.5
        break
      case 'pdf':
        minutes += (bloc.contenu.pages ?? 2) * 0.75
        break
      default:
        minutes += 0.25
    }
  }

  return Math.max(1, Math.round(minutes))
}

/**
 * Contrôles d'accessibilité, remontés à l'auteur — jamais bloquants.
 *
 * Bloquer la publication ferait renoncer les enseignants ; ne rien dire
 * produirait une plateforme inaccessible. On informe, au moment de publier.
 */
export function alertesAccessibilite(blocs: readonly Bloc[]): readonly string[] {
  const alertes: string[] = []

  for (const bloc of blocs) {
    if (bloc.contenu.type === 'video' && !bloc.contenu.sousTitresRessourceId) {
      alertes.push(
        `« ${bloc.contenu.titre} » n'a pas de sous-titres : la vidéo sera inutilisable ` +
          `pour les élèves sourds ou malentendants.`,
      )
    }
  }

  return alertes
}
