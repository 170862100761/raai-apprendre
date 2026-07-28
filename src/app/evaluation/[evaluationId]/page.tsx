import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/noyau/prisma'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantApprenant, IdentifiantEvaluation } from '@/noyau/identifiants'
import { demarrerOuReprendre, depotEvaluationPrisma } from '@/domaines/evaluation'
import { peut } from '@/domaines/identite'
import { exigerSession } from '../../_session'
import { Copie } from './copie'

export const dynamic = 'force-dynamic'

export default async function PageEvaluation({
  params,
}: {
  params: Promise<{ evaluationId: string }>
}) {
  const { evaluationId } = await params
  const session = await exigerSession()

  const apprenantId = session.sujetId as IdentifiantApprenant
  if (!peut(session, 'evaluation.passer', { apprenantId }).autorise) {
    redirect('/aujourdhui')
  }

  const depot = depotEvaluationPrisma(prisma)
  const id = identifiant<IdentifiantEvaluation>(evaluationId)

  // Reprendre plutôt que recréer : un élève dont le réseau coupe retrouve sa
  // tentative au lieu d'en ouvrir une seconde.
  const ouverture = await demarrerOuReprendre(id, apprenantId, depot)
  if (!ouverture.ok) notFound()

  const { evaluation } = ouverture.valeur

  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
      <nav>
        <Link href="/aujourdhui" className="text-sm text-mine-doux underline">
          ← Aujourd’hui
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">{evaluation.titre}</h1>
        <p className="text-sm text-mine-doux">
          {evaluation.questions.length} question
          {evaluation.questions.length > 1 ? 's' : ''}
          {evaluation.dureeMaxMin ? ` · ${evaluation.dureeMaxMin} min` : ''}
        </p>
      </header>

      <Copie evaluationId={evaluation.id} questions={evaluation.questions} />
    </main>
  )
}
