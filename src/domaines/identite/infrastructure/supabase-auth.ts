// Pas de `server-only` ici : ce module transite par la surface publique du
// module, et l'y placer ferait échouer tout test qui importe `@/domaines/
// identite`. Le garde-fou est dans `app/_session.ts`, seul appelant, où il a
// du sens — un adaptateur n'a pas à connaître les composants serveur.
import { createServerClient } from '@supabase/ssr'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantCompte } from '@/noyau/identifiants'

/**
 * Authentification des adultes par Supabase Auth.
 *
 * Remplace `compte.mot_de_passe_hash` et la table `session_compte`, tous deux
 * transitoires. Le reste du code ne s'en aperçoit pas : `resoudreSession`
 * reçoit un `IdentifiantCompte` et ignore d'où il vient.
 *
 * On appelle `getUser()` et non `getSession()`, et ce n'est pas un détail :
 * `getSession()` se contente de décoder le JWT du cookie, qu'un client peut
 * fabriquer. `getUser()` le fait valider par Supabase. Sur une plateforme où
 * un compte adulte donne accès aux données de trente mineurs, la différence
 * n'est pas négociable.
 */

export type Cookie = { readonly name: string; readonly value: string }

export type ConfigurationSupabase = {
  readonly url: string
  readonly cleAnonyme: string
}

/** `null` quand Supabase n'est pas configuré — l'appelant bascule alors sur le chemin transitoire. */
export function configurationSupabase(
  env: Readonly<Record<string, string | undefined>> = process.env,
): ConfigurationSupabase | null {
  const url = env['NEXT_PUBLIC_SUPABASE_URL']
  const cleAnonyme = env['NEXT_PUBLIC_SUPABASE_ANON_KEY']

  if (!url || !cleAnonyme) return null
  return { url, cleAnonyme }
}

/**
 * Résout le compte porté par les cookies Supabase.
 *
 * `poser` reste optionnel : sur une page rendue côté serveur, Next.js interdit
 * d'écrire un cookie, et Supabase tente pourtant de rafraîchir le jeton. On
 * absorbe l'échec plutôt que de faire tomber la page — c'est le
 * comportement recommandé, et l'oublier produit des erreurs incompréhensibles
 * en production.
 */
export async function compteDepuisSupabase(
  configuration: ConfigurationSupabase,
  cookies: {
    lire: () => readonly Cookie[]
    poser?: (cookies: readonly (Cookie & { options?: Record<string, unknown> })[]) => void
  },
): Promise<IdentifiantCompte | null> {
  const client = createServerClient(configuration.url, configuration.cleAnonyme, {
    cookies: {
      getAll: () => [...cookies.lire()],
      setAll: (aPoser: readonly (Cookie & { options?: Record<string, unknown> })[]) => {
        try {
          cookies.poser?.(aPoser)
        } catch {
          // Rendu serveur : écriture impossible, et sans conséquence — le
          // rafraîchissement aura lieu au prochain aller-retour.
        }
      },
    },
  })

  const { data, error } = await client.auth.getUser()
  if (error || !data.user) return null

  return identifiant<IdentifiantCompte>(data.user.id)
}
