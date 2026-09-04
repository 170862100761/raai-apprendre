import Link from 'next/link'
import { redirect } from 'next/navigation'
import { peut } from '@/domaines/identite'
import { depotScoresPrisma, type MeilleurScoreJeu } from '@/domaines/jeux'
import { prisma } from '@/noyau/prisma'
import type { IdentifiantApprenant } from '@/noyau/identifiants'
import { exigerSession } from '../_session'
import { listerJeux, ORDRE_MECANIQUES } from './_contenu'
import { LIBELLE_MECANIQUE } from './_composants/types'
import { MeilleurScore } from './_composants/meilleur-score'

export const metadata = { title: 'Jeux — RAAI Apprendre' }

/** « 8/10 » : la forme que tous les jeux savent lire, quel que soit leur barème. */
function libelleMeilleur(m: MeilleurScoreJeu | undefined): string | null {
  return m ? `${m.score}/${m.scoreMax}` : null
}

/**
 * La liste des jeux, groupés par mécanique. Le meilleur score vient de la
 * base quand l'élève y a déjà joué connecté ; sinon du navigateur, rendu
 * côté client (voir `_composants/scores.ts`).
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

  // La RLS ne rend que les scores de l'élève ; on demande quand même par
  // apprenant pour que l'intention se lise dans la requête.
  const meilleurs = await depotScoresPrisma(prisma).meilleurs(
    session.sujetId as IdentifiantApprenant,
    jeux.map((j) => j.cle),
  )

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
          Une partie réussie à 80 % compte pour tes compétences.
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
                      <MeilleurScore cle={j.cle} enBase={libelleMeilleur(meilleurs.get(j.cle))} />
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
