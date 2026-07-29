import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/noyau/prisma'
import { peut } from '@/domaines/identite'
import { depotOrganisationPrisma } from '@/domaines/organisation'
import { exigerSession } from '../_session'
import { MiseEnRoute } from './formulaires'

export const metadata = { title: 'Administration — RAAI Apprendre' }
export const dynamic = 'force-dynamic'

export default async function PageAdministration() {
  const session = await exigerSession()

  if (!peut(session, 'classe.creer').autorise) redirect('/formateur')
  if (!session.etablissementId) redirect('/connexion-formateur')

  const depot = depotOrganisationPrisma(prisma)
  const [etablissement, offres, annees] = await Promise.all([
    depot.chargerEtablissement(session.etablissementId),
    depot.offresDisponibles(session.etablissementId),
    depot.anneesDisponibles(session.etablissementId),
  ])

  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Mise en route</h1>
        <p className="text-mine-doux">
          {etablissement?.nom} · UAI {etablissement?.uai}
        </p>
      </header>

      <MiseEnRoute offres={offres} annees={annees} />

      <Link href="/administration/journal" className="text-sm underline">
        Consulter le journal des actions
      </Link>
    </main>
  )
}
