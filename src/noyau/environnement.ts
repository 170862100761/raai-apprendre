/**
 * Validation des variables d'environnement au démarrage.
 *
 * L'application refuse de démarrer si une variable requise manque, plutôt que
 * d'échouer trois écrans plus loin avec une erreur sans rapport.
 *
 * Contrôle non négociable : aucune variable contenant KEY, SECRET ou TOKEN ne
 * peut être préfixée NEXT_PUBLIC_. Une clé exposée au navigateur est publique
 * dès le premier chargement de page — il n'y a pas de retour en arrière.
 */
import { z } from 'zod'

const SENSIBLE = /(KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL)/i

/**
 * Une seule exception, nominative et documentée.
 *
 * La clé anonyme Supabase est **conçue** pour partir dans le navigateur : elle
 * n'ouvre rien par elle-même, tout dépend de la RLS. La refuser rendrait
 * Supabase inutilisable ; élargir la règle à « ANON » ouvrirait la porte à
 * n'importe quelle variable qu'on baptiserait ainsi. D'où la liste d'un seul
 * nom exact.
 */
const PUBLIQUES_ASSUMEES: ReadonlySet<string> = new Set(['NEXT_PUBLIC_SUPABASE_ANON_KEY'])

/** Rejoué en test ET au démarrage : le contrôle ne sert à rien s'il est différable. */
export function verifierAucunSecretExpose(
  variables: Record<string, string | undefined>,
): string[] {
  return Object.keys(variables).filter(
    (nom) =>
      nom.startsWith('NEXT_PUBLIC_') &&
      !PUBLIQUES_ASSUMEES.has(nom) &&
      SENSIBLE.test(nom.slice('NEXT_PUBLIC_'.length)),
  )
}

const Schema = z.object({
  DATABASE_URL: z.string().url(),
  DIRECT_URL: z.string().url(),

  NEXT_PUBLIC_URL_SITE: z.string().url(),

  // Signature des jetons de session apprenant. 32 octets : un secret plus court
  // ramènerait la sécurité du mode minimal à celle du code à 4 chiffres.
  SECRET_SESSION_APPRENANT: z.string().min(32),

  // Supabase n'est pas encore branché : optionnel tant que le compte n'existe
  // pas. Le jour où il l'est, ces trois-là deviennent requises d'un bloc.
  NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),

  IA_FOURNISSEUR_DEFAUT: z
    .enum(['claude', 'gemini', 'openai', 'mistral', 'ollama'])
    .default('claude'),
  ANTHROPIC_API_KEY: z.string().optional(),
  GOOGLE_AI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  MISTRAL_API_KEY: z.string().optional(),
  OLLAMA_BASE_URL: z.string().url().optional(),

  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
})

export type Environnement = z.infer<typeof Schema>

/** Un dictionnaire suffit : exiger `ProcessEnv` ne rendrait le contrôle ni plus
 *  sûr ni plus lisible, et forcerait chaque appelant à fabriquer un faux
 *  environnement complet. */
export type SourceEnvironnement = Readonly<Record<string, string | undefined>>

export function lireEnvironnement(source: SourceEnvironnement = process.env): Environnement {
  const exposes = verifierAucunSecretExpose(source)
  if (exposes.length > 0) {
    throw new Error(
      `Secrets exposés au navigateur : ${exposes.join(', ')}. ` +
        `Retirer le préfixe NEXT_PUBLIC_ et considérer ces valeurs comme compromises.`,
    )
  }

  // Une configuration Supabase à moitié remplie est pire que pas de Supabase
  // du tout : l'application basculerait sur le chemin Supabase sans pouvoir
  // s'authentifier, et personne ne comprendrait pourquoi.
  const supabase = [
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
  ]
  const remplies = supabase.filter((nom) => source[nom])

  if (remplies.length > 0 && remplies.length < supabase.length) {
    const manquantes = supabase.filter((nom) => !source[nom])
    throw new Error(
      `Configuration Supabase incomplète : ${manquantes.join(', ')}. ` +
        `Renseigne les trois variables, ou aucune.`,
    )
  }

  const resultat = Schema.safeParse(source)
  if (!resultat.success) {
    const details = resultat.error.issues
      .map((i) => `  · ${i.path.join('.')} : ${i.message}`)
      .join('\n')
    throw new Error(`Variables d'environnement invalides :\n${details}`)
  }

  return resultat.data
}
