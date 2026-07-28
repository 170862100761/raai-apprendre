import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/noyau/prisma'
import {
  depotMediathequePrisma,
  servirMedia,
  TYPES_ACCEPTES,
  stockageDisque,
} from '@/domaines/mediatheque'
import { sessionCourante } from '../../../../_session'

/**
 * Service des médias.
 *
 * C'est ici que se joue la question « un fichier déposé par un enseignant
 * peut-il s'exécuter chez un élève ? ». La réponse doit être non, et elle tient
 * à quatre en-têtes :
 *
 * - `Content-Type` pris dans NOTRE liste blanche, jamais dans le fichier ;
 * - `nosniff`, sinon le navigateur devine et se trompe ;
 * - `Content-Disposition: attachment` pour tout ce qui n'est pas une image ou
 *   une vidéo — un PDF peut contenir du JavaScript ;
 * - une CSP restrictive, qui neutralise ce qui passerait quand même.
 *
 * En production, ces fichiers seront servis depuis un domaine distinct de
 * l'application. Tant que ce n'est pas le cas, ces en-têtes sont la seule
 * barrière — d'où leur redondance délibérée.
 */

export const runtime = 'nodejs'

const AFFICHABLES = new Set(
  TYPES_ACCEPTES.filter((t) => t.affichable).map((t) => t.mime),
)

export async function GET(
  _requete: NextRequest,
  { params }: { params: Promise<{ ressourceId: string }> },
) {
  const { ressourceId } = await params

  // Rien de pédagogique n'est public. La RLS filtre déjà par établissement ;
  // cette vérification-ci évite d'exposer la médiathèque à un anonyme qui
  // devinerait un UUID.
  const session = await sessionCourante()
  if (session.sujetId === null) {
    return new NextResponse(null, { status: 404 })
  }

  const resultat = await servirMedia(
    ressourceId,
    { depot: depotMediathequePrisma(prisma), stockage: stockageDisque },
    (mime) => AFFICHABLES.has(mime),
  )

  // 404 et non 403 : distinguer confirmerait l'existence d'un média
  // appartenant à un autre établissement.
  if (!resultat.ok) return new NextResponse(null, { status: 404 })

  const { contenu, typeMime, nom, affichable } = resultat.valeur

  return new NextResponse(new Uint8Array(contenu), {
    headers: {
      'Content-Type': typeMime,
      'Content-Length': String(contenu.byteLength),
      'Content-Disposition': `${affichable ? 'inline' : 'attachment'}; filename="${nom}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      // Privé : un média peut être une copie d'élève, jamais de cache partagé.
      //
      // Une heure est sûre parce que le contenu d'une URL ne change JAMAIS :
      // remplacer une image crée une nouvelle ressource, donc une nouvelle
      // URL. Si un jour on autorisait l'écrasement en place, ce cache
      // afficherait l'ancienne image pendant une heure — constaté en
      // développement, où le jeu de démonstration réutilise un identifiant.
      'Cache-Control': 'private, max-age=3600',
    },
  })
}
