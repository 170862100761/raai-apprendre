import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_APPRENANT, COOKIE_COMPTE, verifierJeton } from '@/noyau/cookie-session'
import { ecranDeConnexion } from './app/_destination'

/**
 * Le middleware s'exécute sur l'Edge : **pas de Prisma ici.**
 *
 * Il ne résout pas la session — il ne peut pas, il n'a pas la base. Il fait
 * trois choses bon marché : vérifier la signature du cookie, rediriger si
 * aucune preuve n'est présente, poser les en-têtes de sécurité.
 *
 * La vraie résolution (`resoudreSession`) se fait dans les Server Components et
 * les Server Actions, qui eux ont accès à la base. Un cookie signé n'est PAS
 * une session valide : le jeton peut être révoqué ou expiré, et seule la base
 * le sait. Ne jamais traiter le passage du middleware comme une autorisation.
 */

// `/deconnexion` est publique par nécessité : c'est la route qui efface les
// cookies. La protéger la rendrait inatteignable précisément quand elle sert —
// quand la session ne se résout plus.
const PUBLIC = [
  '/',
  '/connexion',
  '/connexion-formateur',
  '/deconnexion',
  '/offre',
  '/mentions-legales',
]

function estPublic(chemin: string): boolean {
  return (
    PUBLIC.includes(chemin) ||
    chemin.startsWith('/_next') ||
    chemin.startsWith('/api/v1/webhooks') ||
    // Les icônes servies par l'App Router (`app/icon.svg`, `app/apple-icon.*`)
    // et les fichiers de `public/` : un favicon redirigé vers /connexion
    // laisse l'onglet sans icône.
    chemin === '/favicon.ico' ||
    /^\/(icon|apple-icon|opengraph-image|twitter-image)\d*\.[a-z]+$/.test(chemin) ||
    /\.(svg|png|ico|webmanifest|txt|xml)$/.test(chemin)
  )
}

export async function middleware(requete: NextRequest) {
  const { pathname } = requete.nextUrl

  if (estPublic(pathname)) return NextResponse.next()

  const secret = process.env.SECRET_SESSION_APPRENANT
  if (!secret) {
    // Mal configuré : on refuse plutôt que de laisser passer. Une plateforme
    // qui s'ouvre parce qu'une variable manque est pire qu'une plateforme
    // indisponible.
    return NextResponse.redirect(new URL('/connexion?erreur=configuration', requete.url))
  }

  const jetonApprenant = await verifierJeton(
    requete.cookies.get(COOKIE_APPRENANT)?.value,
    secret,
  )
  // Deux preuves possibles pour un adulte : le cookie transitoire, ou les
  // cookies de session Supabase (`sb-<ref>-auth-token`, éventuellement
  // découpés en `.0`, `.1`…). Présence seulement — la validité se juge en
  // aval, comme pour le reste. Oublier Supabase ici créait une boucle : le
  // middleware renvoyait vers la connexion, qui voyait la session et
  // renvoyait vers l'espace formateur, sans fin.
  const aUnCompte =
    requete.cookies.has(COOKIE_COMPTE) ||
    requete.cookies
      .getAll()
      .some((c) => c.name.startsWith('sb-') && c.name.includes('-auth-token'))

  if (!jetonApprenant && !aUnCompte) {
    // Une route d'API ne se redirige pas vers une page de connexion : un
    // `<img>` suivrait la redirection et recevrait du HTML en 200, ce qui
    // masque l'erreur au lieu de la signaler.
    if (pathname.startsWith('/api/')) {
      return new NextResponse(null, { status: 404 })
    }

    // L'écran dépend de l'espace demandé : un formateur dont la session a
    // expiré sur la grille de suivi atterrissait devant le formulaire élève,
    // tutoyé, avec un champ à quatre chiffres où son mot de passe n'entre pas.
    const versConnexion = new URL(ecranDeConnexion(pathname), requete.url)
    // Pour revenir où la personne voulait aller après s'être identifiée.
    versConnexion.searchParams.set('suite', pathname)

    const reponse = NextResponse.redirect(versConnexion)
    // Cookie présent mais invalide : on le retire, sinon l'élève boucle sur la
    // redirection sans comprendre pourquoi.
    if (requete.cookies.has(COOKIE_APPRENANT)) reponse.cookies.delete(COOKIE_APPRENANT)
    return reponse
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
