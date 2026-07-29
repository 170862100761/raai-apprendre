import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/noyau/prisma'
import { depotCataloguePrisma } from '@/domaines/catalogue'
import { peut } from '@/domaines/identite'
import { exigerSession } from '../../../_session'
import { FormulaireCreation } from './formulaire'

export const metadata = { title: 'Nouvelle leçon — RAAI Apprendre' }
export const dynamic = 'force-dynamic'

export default async function PageNouvelleLecon() {
  const session = await exigerSession()
  if (!peut(session, 'lecon.ecrire').autorise) redirect('/aujourdhui')
  if (!session.etablissementId) redirect('/connexion-formateur')

  const depot = depotCataloguePrisma(prisma)
  const [chapitres, competences] = await Promise.all([
    depot.chapitresDisponibles(session.etablissementId),
    depot.competencesDuDiplome(session.etablissementId),
  ])

  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
      <nav>
        <Link href="/formateur" className="text-sm text-mine-doux underline">
          ← Mes leçons
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Nouvelle leçon</h1>
        <p className="text-mine-doux">
          Le rattachement au référentiel se fait maintenant, pas à la fin :
          c’est lui qui fait remonter la leçon dans la progression de tes élèves.
        </p>
      </header>

      <FormulaireCreation chapitres={chapitres} competences={competences} />
    </main>
  )
}
