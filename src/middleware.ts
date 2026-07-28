import { NextResponse, type NextRequest } from 'next/server'
import { COOKIE_APPRENANT, COOKIE_COMPTE, verifierJeton } from '@/noyau/cookie-session'

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
    chemin === '/favicon.ico'
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
  const aUnCompte = requete.cookies.has(COOKIE_COMPTE)

  if (!jetonApprenant && !aUnCompte) {
    // Une route d'API ne se redirige pas vers une page de connexion : un
    // `<img>` suivrait la redirection et recevrait du HTML en 200, ce qui
    // masque l'erreur au lieu de la signaler.
    if (pathname.startsWith('/api/')) {
      return new NextResponse(null, { status: 404 })
    }

    const versConnexion = new URL('/connexion', requete.url)
    // Pour revenir où l'élève voulait aller après s'être identifié.
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
