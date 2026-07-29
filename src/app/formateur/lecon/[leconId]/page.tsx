import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/noyau/prisma'
import { identifiant, type IdentifiantLecon } from '@/noyau/identifiants'
import { depotCataloguePrisma } from '@/domaines/catalogue'
import { peut } from '@/domaines/identite'
import { exigerSession } from '../../../_session'
import { Editeur } from './editeur'

export const dynamic = 'force-dynamic'

export default async function PageEdition({
  params,
}: {
  params: Promise<{ leconId: string }>
}) {
  const { leconId } = await params
  const session = await exigerSession()

  if (!peut(session, 'lecon.ecrire').autorise) redirect('/aujourdhui')
  if (!session.etablissementId) redirect('/connexion-formateur')

  const depot = depotCataloguePrisma(prisma)
  const [lecon, competences] = await Promise.all([
    depot.chargerLecon(identifiant<IdentifiantLecon>(leconId)),
    depot.competencesDuDiplome(session.etablissementId),
  ])

  // La RLS a déjà écarté ce qui appartient à un autre établissement.
  if (!lecon) notFound()

  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
      <nav className="flex items-center gap-4">
        <Link href="/formateur" className="text-sm text-mine-doux underline">
          ← Mes leçons
        </Link>
        {lecon.statut === 'publiee' ? (
          <Link href={`/cours/${lecon.id}`} className="text-sm text-mine-doux underline">
            Voir la page élève
          </Link>
        ) : null}
      </nav>

      <header className="flex flex-col gap-1">
        <p className="text-sm text-mine-doux">
          {lecon.matiere} · {lecon.chapitre}
        </p>
        <h1 className="text-2xl font-semibold">{lecon.titre}</h1>
        {lecon.statut === 'publiee' ? (
          <p className="text-sm text-mine-doux">
            Publiée. La modifier repassera la leçon en brouillon, sur une
            nouvelle version — les élèves qui la lisent ne verront pas le texte
            changer sous leurs yeux.
          </p>
        ) : null}
      </header>

      <Editeur
        leconId={lecon.id}
        titreInitial={lecon.titre}
        statut={lecon.statut}
        competencesChoisies={lecon.competences}
        competences={competences}
        blocsInitiaux={lecon.blocs.map((b) => b.contenu)}
      />
    </main>
  )
}
