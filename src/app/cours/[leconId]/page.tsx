import { cache } from 'react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/noyau/prisma'
import { identifiant, type IdentifiantApprenant, type IdentifiantLecon } from '@/noyau/identifiants'
import { depotCataloguePrisma } from '@/domaines/catalogue'
import { peut } from '@/domaines/identite'
import { exigerSession } from '../../_session'
import { RenduBloc } from '../../_composants/rendu-bloc'
import { MarqueurDeLecture } from './marqueur-de-lecture'

export const dynamic = 'force-dynamic'

/**
 * `generateMetadata` et la page ont besoin de la même leçon. Sans mémoïsation,
 * ouvrir un cours coûterait deux lectures au lieu d'une — à 9 h, quand des
 * milliers de classes ouvrent la même page, on ne double pas une requête pour
 * un titre d'onglet.
 */
const chargerLecon = cache(async (leconId: string) =>
  depotCataloguePrisma(prisma).chargerLecon(identifiant<IdentifiantLecon>(leconId)),
)

export async function generateMetadata({
  params,
}: {
  params: Promise<{ leconId: string }>
}) {
  const { leconId } = await params
  const lecon = await chargerLecon(leconId)

  // Une leçon non publiée ou hors périmètre ne donne pas son titre : l'onglet
  // ne doit pas révéler ce que la page elle-même refuse d'afficher.
  if (!lecon || lecon.statut !== 'publiee') return { title: 'RAAI Apprendre' }

  return { title: `${lecon.titre} — RAAI Apprendre` }
}

export default async function PageLecon({
  params,
}: {
  params: Promise<{ leconId: string }>
}) {
  const { leconId } = await params
  const session = await exigerSession()

  if (!peut(session, 'lecon.lire').autorise) redirect('/connexion')

  const lecon = await chargerLecon(leconId)

  // La RLS a déjà écarté ce qui est hors périmètre. `notFound` couvre donc
  // aussi bien « n'existe pas » que « pas pour toi » — et c'est délibéré :
  // distinguer les deux confirmerait l'existence d'une leçon d'un autre
  // établissement.
  if (!lecon || lecon.statut !== 'publiee') notFound()

  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
      <nav>
        <Link href="/aujourdhui" className="text-sm text-mine-doux underline">
          ← Aujourd’hui
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <p className="text-sm text-mine-doux">
          {lecon.matiere} · {lecon.chapitre}
        </p>
        <h1 className="text-2xl font-semibold">{lecon.titre}</h1>
        <p className="text-sm text-mine-doux">
          {lecon.dureeEstimeeMin} min de lecture
        </p>
      </header>

      <article className="flex flex-col gap-6">
        {lecon.blocs.map((bloc) => (
          <RenduBloc key={bloc.id} contenu={bloc.contenu} />
        ))}
      </article>

      {/* Le quiz suit la leçon : c'est là qu'un élève a envie de vérifier
          qu'il a compris, pas dans un onglet séparé. */}
      {lecon.evaluation ? (
        <Link
          href={`/evaluation/${lecon.evaluation.id}`}
          className="w-fit rounded-carte bg-accent px-5 py-3 font-medium text-accent-contraste"
        >
          Passer le quiz : {lecon.evaluation.titre}
        </Link>
      ) : null}

      <MarqueurDeLecture
        leconId={leconId}
        apprenantId={session.sujetId as IdentifiantApprenant}
        dernierBloc={lecon.blocs.length}
      />
    </main>
  )
}
