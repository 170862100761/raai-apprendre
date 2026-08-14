import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/noyau/prisma'
import {
  depotMediathequePrisma,
  MIME_APERCU_3D,
  servirApercu3d,
} from '@/domaines/mediatheque'
import { sessionCourante } from '../../../../../_session'
import { stockage } from '../../../../../_stockage'

/**
 * Service de l'aperçu 3D pré-tessellé.
 *
 * Une route distincte de celle du média, et non un paramètre de requête : l'URL
 * du média rend toujours le fichier original. Un enseignant qui télécharge un
 * STEP doit recevoir son STEP, pas une approximation triangulée, et une
 * bascule pilotée par la query aurait fini par se tromper de sens un jour.
 *
 * `HEAD` répond sans corps : c'est ainsi que la visionneuse sait s'il existe un
 * aperçu avant de proposer un bouton. Proposer d'afficher un modèle puis
 * échouer est pire que ne rien proposer.
 *
 * Les en-têtes sont ceux de la route média, pour la même raison : ce fichier est
 * dérivé d'un contenu déposé par un enseignant, et rien de déposé ne doit
 * pouvoir s'exécuter dans l'origine qui porte les cookies de session. Un GLB
 * n'est pas exécutable, mais l'en-tête ne se déduit pas du format — il se pose.
 */

export const runtime = 'nodejs'

async function repondre(ressourceId: string, avecCorps: boolean) {
  // Rien de pédagogique n'est public, aperçu compris : il porte la géométrie du
  // fichier source.
  const session = await sessionCourante()
  if (session.sujetId === null) {
    return new NextResponse(null, { status: 404 })
  }

  const resultat = await servirApercu3d(ressourceId, {
    depot: depotMediathequePrisma(prisma),
    stockage: stockage(),
  })

  // 404 et non 403 : distinguer confirmerait l'existence d'un média appartenant
  // à un autre établissement. C'est aussi la réponse quand la conversion n'est
  // pas terminée ou a échoué — pour l'appelant, il n'y a pas d'aperçu, et le
  // détail du pourquoi appartient à l'enseignant, pas à l'URL.
  if (!resultat.ok) return new NextResponse(null, { status: 404 })

  const { contenu, nom } = resultat.valeur

  return new NextResponse(avecCorps ? new Uint8Array(contenu) : null, {
    headers: {
      'Content-Type': MIME_APERCU_3D,
      'Content-Length': String(contenu.byteLength),
      'Content-Disposition': `attachment; filename="${nom}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': 'private, max-age=3600',
    },
  })
}

export async function GET(
  _requete: NextRequest,
  { params }: { params: Promise<{ ressourceId: string }> },
) {
  const { ressourceId } = await params
  return repondre(ressourceId, true)
}

export async function HEAD(
  _requete: NextRequest,
  { params }: { params: Promise<{ ressourceId: string }> },
) {
  const { ressourceId } = await params
  return repondre(ressourceId, false)
}
