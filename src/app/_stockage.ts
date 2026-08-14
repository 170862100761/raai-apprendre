import 'server-only'
import { lireEnvironnement } from '@/noyau/environnement'
import {
  stockageDisque,
  stockageSupabase,
  type StockageObjet,
} from '@/domaines/mediatheque'

/**
 * Choix du stockage — même bascule automatique que `sessionCourante()` :
 * les trois variables Supabase présentes, c'est Supabase Storage ; sinon le
 * disque local transitoire. Aucun écran ni cas d'usage ne connaît ce choix.
 *
 * Sur Vercel, le disque est éphémère et non partagé : cette fonction est ce
 * qui empêche `stockageDisque` d'y être déployé par inadvertance.
 */
let choisi: StockageObjet | null = null

export function stockage(): StockageObjet {
  if (choisi) return choisi
  const env = lireEnvironnement()
  choisi =
    env.NEXT_PUBLIC_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
      ? stockageSupabase({
          url: env.NEXT_PUBLIC_SUPABASE_URL,
          cleServiceRole: env.SUPABASE_SERVICE_ROLE_KEY,
        })
      : stockageDisque
  return choisi
}
