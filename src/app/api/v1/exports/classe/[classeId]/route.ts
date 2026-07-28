import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/noyau/prisma'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantClasse } from '@/noyau/identifiants'
import {
  depotProgressionPrisma,
  grilleEnCsv,
  nomFichierSur,
  suivreClasse,
} from '@/domaines/progression'
import { peut } from '@/domaines/identite'
import { sessionCourante } from '../../../../../_session'
import { auditer } from '../../../../../_audit'

/**
 * Export CSV de la grille de suivi.
 *
 * Une route API plutôt qu'une Server Action : il faut une URL stable qu'un
 * navigateur puisse télécharger, et un jour ce sera un flux pour les classes
 * nombreuses.
 *
 * Le CSV est destiné à Excel en français, ce qui impose deux choses qu'on
 * oublie toujours et qui rendent le fichier illisible :
 * le séparateur point-virgule, et la BOM UTF-8.
 */

export const runtime = 'nodejs'

export async function GET(
  _requete: NextRequest,
  { params }: { params: Promise<{ classeId: string }> },
) {
  const { classeId } = await params

  const session = await sessionCourante()
  if (session.sujetId === null) return new NextResponse(null, { status: 404 })

  const id = identifiant<IdentifiantClasse>(classeId)
  if (!peut(session, 'export.produire', { classeId: id }).autorise) {
    // 404 et non 403 : ne pas confirmer l'existence d'une classe hors périmètre.
    return new NextResponse(null, { status: 404 })
  }

  const suivi = await suivreClasse(id, depotProgressionPrisma(prisma))
  if (!suivi.ok) return new NextResponse(null, { status: 404 })

  const { nomClasse, grille, index } = suivi.valeur

  // `export.produit` figure parmi les actions dont la trace est OBLIGATOIRE :
  // ce fichier emporte hors de la plateforme le suivi de compétences d'une
  // classe entière. L'import de `auditer` était là depuis le début, l'appel
  // manquait — l'export sortait sans laisser de trace.
  await auditer('export.produit', session, { type: 'classe', id: classeId })

  // La mise en forme vit dans le domaine : séparateur, BOM et neutralisation
  // des formules sont des règles, pas de la plomberie HTTP — et elles se
  // testent sans démarrer de serveur.
  return new NextResponse(grilleEnCsv(grille, index), {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="suivi-${nomFichierSur(nomClasse)}.csv"`,
      // Une note d'élève ne se met jamais en cache partagé.
      'Cache-Control': 'no-store',
    },
  })
}
