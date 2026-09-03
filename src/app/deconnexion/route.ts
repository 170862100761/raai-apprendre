import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_APPRENANT, COOKIE_COMPTE } from '@/noyau/cookie-session'

/**
 * Sortie de session — la seule porte qui efface les cookies.
 *
 * Un composant serveur ne peut pas supprimer un cookie pendant son rendu ;
 * seuls un gestionnaire de route, une Server Action ou le middleware le
 * peuvent. D'où cette route : c'est ici qu'aboutit une session qu'on ne sait
 * plus résoudre.
 *
 * Le cas qui la motive : un cookie de compte valide mais dont le profil est
 * introuvable — cookie posé par une autre application sur le même hôte (les
 * cookies ignorent le numéro de port), compte désactivé, ou base réinitialisée.
 * Sans cette sortie, `resoudreSession` renvoyait une session anonyme, l'élève
 * était renvoyé vers la connexion, se connectait avec succès… et retombait au
 * même endroit. Une boucle silencieuse, sans message, sur un poste partagé.
 */
export async function GET(requete: NextRequest) {
  const reponse = NextResponse.redirect(new URL('/connexion', requete.url))

  reponse.cookies.delete(COOKIE_APPRENANT)
  reponse.cookies.delete(COOKIE_COMPTE)
  // Les cookies de session Supabase (`sb-<ref>-auth-token`, parfois découpés
  // en `.0`, `.1`…) : sans eux, la sortie ne sortait pas un adulte Supabase.
  for (const cookie of requete.cookies.getAll()) {
    if (cookie.name.startsWith('sb-') && cookie.name.includes('-auth-token')) {
      reponse.cookies.delete(cookie.name)
    }
  }

  return reponse
}
