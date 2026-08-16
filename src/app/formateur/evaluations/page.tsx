import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/noyau/prisma'
import { peut } from '@/domaines/identite'
import { depotEvaluationPrisma } from '@/domaines/evaluation'
import { depotCataloguePrisma } from '@/domaines/catalogue'
import { exigerSession } from '../../_session'
import { FormulaireCreation } from './_creation'

export const metadata = { title: 'Évaluations — RAAI Apprendre' }
export const dynamic = 'force-dynamic'

const LIBELLES_TYPE: Record<string, string> = {
  quiz: 'Quiz',
  exercice: 'Exercice',
  devoir: 'Devoir',
  tp: 'TP',
  ccf: 'CCF',
  examen: 'Examen',
}

export default async function PageEvaluations() {
  const session = await exigerSession()
  if (!peut(session, 'evaluation.ecrire').autorise || !session.etablissementId) {
    redirect('/formateur')
  }

  const [evaluations, chapitres] = await Promise.all([
    depotEvaluationPrisma(prisma).evaluationsDeLEtablissement(session.etablissementId),
    depotCataloguePrisma(prisma).chapitresDisponibles(session.etablissementId),
  ])

  const brouillons = evaluations.filter((e) => e.statut === 'brouillon')
  const publiees = evaluations.filter((e) => e.statut === 'publiee')

  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <nav>
        <Link href="/formateur" className="text-sm text-mine-doux underline">
          ← Mes leçons
        </Link>
      </nav>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Évaluations</h1>
        <p className="text-sm text-mine-doux">
          Un brouillon n’est jamais visible des élèves. Publier, c’est proposer
          une note — et c’est journalisé.
        </p>
      </header>

      <FormulaireCreation chapitres={chapitres} />

      {[
        ['À relire et publier', brouillons],
        ['Publiées', publiees],
      ].map(([titre, liste]) =>
        (liste as typeof evaluations).length > 0 ? (
          <section key={titre as string} className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">{titre as string}</h2>
            <ul className="flex flex-col gap-2">
              {(liste as typeof evaluations).map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/formateur/evaluations/${e.id}`}
                    className="flex items-baseline justify-between gap-3 rounded-carte border
                               border-bordure bg-surface px-4 py-3 hover:border-accent"
                  >
                    <span className="flex flex-col gap-0.5">
                      <span className="font-medium">{e.titre}</span>
                      <span className="text-sm text-mine-doux">
                        {e.chapitre} · {LIBELLES_TYPE[e.type] ?? e.type} ·{' '}
                        {e.nombreQuestions} question{e.nombreQuestions > 1 ? 's' : ''}
                      </span>
                    </span>
                    <span
                      className={
                        e.statut === 'publiee' ? 'text-sm text-accent' : 'text-sm text-mine-doux'
                      }
                    >
                      {e.statut === 'publiee' ? 'Publiée' : 'Brouillon'}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null,
      )}
    </main>
  )
}
