import Link from 'next/link'
import { redirect } from 'next/navigation'
import { peut } from '@/domaines/identite'
import type { IdentifiantApprenant } from '@/noyau/identifiants'
import { exigerSession } from '../_session'
import { listerJeux, ORDRE_MECANIQUES } from './_contenu'
import { LIBELLE_MECANIQUE } from './_composants/types'
import { MeilleurScore } from './_composants/meilleur-score'

export const metadata = { title: 'Jeux — RAAI Apprendre' }

/**
 * La liste des jeux, groupés par mécanique. Le meilleur score est local au
 * navigateur (voir `_composants/scores.ts`) : il est donc rendu côté client.
 */
export default async function PageJeux() {
  const session = await exigerSession()

  // Même logique que « Aujourd'hui » : la RLS ne dit rien ici, le contenu est
  // national ; mais l'écran est pensé pour un élève, pas pour un adulte.
  const acces = peut(session, 'progression.lire_la_sienne', {
    apprenantId: session.sujetId as IdentifiantApprenant,
  })
  if (!acces.autorise) redirect('/formateur')

  const jeux = listerJeux()

  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
      <nav>
        <Link href="/aujourdhui" className="text-sm text-mine-doux underline">
          ← Aujourd’hui
        </Link>
      </nav>

      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Jeux</h1>
        <p className="text-mine-doux">
          De l’entraînement, pas une évaluation : rien n’est noté, rejoue autant que tu veux.
          Ton meilleur score reste sur cet ordinateur.
        </p>
      </header>

      {jeux.length === 0 ? (
        <p className="rounded-carte border border-bordure px-4 py-6 text-center text-mine-doux">
          Aucun jeu n’est encore disponible.
        </p>
      ) : (
        ORDRE_MECANIQUES.map((mecanique) => {
          const groupe = jeux.filter((j) => j.mecanique === mecanique)
          if (groupe.length === 0) return null
          return (
            <section key={mecanique} className="flex flex-col gap-3">
              <h2 className="text-sm font-medium text-mine-doux">
                {LIBELLE_MECANIQUE[mecanique]}
              </h2>
              <ul className="flex flex-col gap-2">
                {groupe.map((j) => (
                  <li key={j.slug}>
                    <Link
                      href={`/jeux/${j.slug}`}
                      className="flex items-baseline justify-between gap-3 rounded-carte border border-bordure
                                 bg-surface px-4 py-3 transition-opacity hover:opacity-90"
                    >
                      <span className="flex flex-col gap-0.5">
                        <span className="font-medium">{j.titre}</span>
                        <span className="text-sm text-mine-doux">
                          {j.difficulte}
                          {j.capacites.length > 0 ? ` · ${j.capacites.join(', ')}` : ''}
                        </span>
                      </span>
                      <MeilleurScore cle={j.cle} />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )
        })
      )}
    </main>
  )
}
