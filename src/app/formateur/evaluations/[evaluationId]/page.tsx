import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/noyau/prisma'
import { identifiant, type IdentifiantEvaluation } from '@/noyau/identifiants'
import { peut } from '@/domaines/identite'
import { depotEvaluationPrisma } from '@/domaines/evaluation'
import { exigerSession } from '../../../_session'
import { Editeur } from './editeur'

export const dynamic = 'force-dynamic'

export default async function PageEditionEvaluation({
  params,
}: {
  params: Promise<{ evaluationId: string }>
}) {
  const { evaluationId } = await params
  const session = await exigerSession()
  if (!peut(session, 'evaluation.ecrire').autorise || !session.etablissementId) {
    redirect('/formateur')
  }

  const evaluation = await depotEvaluationPrisma(prisma).chargerPourEdition(
    identifiant<IdentifiantEvaluation>(evaluationId),
    session.etablissementId,
  )
  if (!evaluation) notFound()

  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <nav>
        <Link href="/formateur/evaluations" className="text-sm text-mine-doux underline">
          ← Évaluations
        </Link>
      </nav>
      <Editeur evaluation={evaluation} />
    </main>
  )
}
