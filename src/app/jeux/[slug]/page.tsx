import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { peut } from '@/domaines/identite'
import type { IdentifiantApprenant } from '@/noyau/identifiants'
import { exigerSession } from '../../_session'
import { jeu, listerJeux } from '../_contenu'
import { Jeu } from '../_composants/jeu'
import { LIBELLE_MECANIQUE } from '../_composants/types'

/** Les adresses sont connues au build : elles viennent des fichiers. */
export function generateStaticParams() {
  return listerJeux().map((j) => ({ slug: j.slug }))
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const j = jeu(slug)
  return { title: j ? `${j.titre} — RAAI Apprendre` : 'RAAI Apprendre' }
}

export default async function PageJeu({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const session = await exigerSession()

  const acces = peut(session, 'progression.lire_la_sienne', {
    apprenantId: session.sujetId as IdentifiantApprenant,
  })
  if (!acces.autorise) redirect('/formateur')

  const j = jeu(slug)
  if (!j) notFound()

  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <nav>
        <Link href="/jeux" className="text-sm text-mine-doux underline">
          ← Tous les jeux
        </Link>
      </nav>

      <header className="flex flex-col gap-1">
        <p className="text-sm text-mine-doux">
          {LIBELLE_MECANIQUE[j.mecanique]} · {j.difficulte}
        </p>
        <h1 className="text-2xl font-semibold">{j.titre}</h1>
      </header>

      <Jeu jeu={j} />
    </main>
  )
}
