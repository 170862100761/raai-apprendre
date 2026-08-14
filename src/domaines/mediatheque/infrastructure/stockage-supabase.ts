// Pas de `server-only` ici : l'outil de rattrapage (`npm run medias:apercus`)
// tourne hors de Next et importe l'index du module. La clé arrive en
// paramètre — c'est l'appelant (`app/_stockage.ts`) qui est server-only.
import { createClient } from '@supabase/supabase-js'
import type { StockageObjet } from '../ports/stockage'

/**
 * Stockage Supabase (bucket privé `medias`) — le pendant production de
 * `stockage-disque`, comme prévu par la bascule (doc 13 §6). Même port,
 * mêmes cas d'usage, mêmes écrans : seul l'adaptateur diffère.
 *
 * La clé `service_role` est requise : le bucket est privé, et c'est notre
 * route `/api/v1/medias/[id]` qui décide qui lit quoi — pas une URL signée
 * qu'on ne saurait pas révoquer.
 */
export function stockageSupabase(configuration: {
  url: string
  cleServiceRole: string
  bucket?: string
}): StockageObjet {
  const client = createClient(configuration.url, configuration.cleServiceRole, {
    auth: { persistSession: false },
  })
  const bucket = configuration.bucket ?? 'medias'

  return {
    async ecrire(chemin, contenu, typeMime) {
      const { error } = await client.storage
        .from(bucket)
        .upload(chemin, contenu, { contentType: typeMime, upsert: true })
      if (error) throw new Error(`Écriture Supabase Storage : ${error.message}`)
    },

    async lire(chemin) {
      const { data, error } = await client.storage.from(bucket).download(chemin)
      // Fichier absent : cas nominal, pas une panne — même contrat que le disque.
      if (error || !data) return null
      return new Uint8Array(await data.arrayBuffer())
    },

    async supprimer(chemin) {
      // Supprimer ce qui n'existe pas est un succès ; Supabase est du même avis.
      await client.storage.from(bucket).remove([chemin])
    },
  }
}
