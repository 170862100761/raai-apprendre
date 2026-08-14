import { cache } from 'react'
import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { prisma } from '@/noyau/prisma'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantClasse } from '@/noyau/identifiants'
import {
  avancement,
  depotProgressionPrisma,
  suivreClasse,
  JOURS_AVANT_SIGNALEMENT,
} from '@/domaines/progression'
import { peut } from '@/domaines/identite'
import { exigerSession } from '../../../_session'
import { Grille } from './grille'

export const dynamic = 'force-dynamic'

/**
 * Le suivi d'une classe est la lecture la plus lourde de l'application — douze
 * élèves croisés avec leurs acquis. La mémoïsation garantit que le titre de
 * l'onglet ne la déclenche pas une seconde fois.
 */
const chargerSuivi = cache(async (classeId: string) =>
  suivreClasse(identifiant<IdentifiantClasse>(classeId), depotProgressionPrisma(prisma)),
)

export async function generateMetadata({
  params,
}: {
  params: Promise<{ classeId: string }>
}) {
  const { classeId } = await params
  const suivi = await chargerSuivi(classeId)

  // Le nom de la classe seul — jamais un nom d'élève dans un titre d'onglet,
  // qui se retrouve dans l'historique du navigateur et les captures d'écran.
  if (!suivi.ok) return { title: 'RAAI Apprendre' }
  return { title: `${suivi.valeur.nomClasse} — Suivi — RAAI Apprendre` }
}

export default async function PageSuiviClasse({
  params,
}: {
  params: Promise<{ classeId: string }>
}) {
  const { classeId } = await params
  const session = await exigerSession()

  const id = identifiant<IdentifiantClasse>(classeId)
  if (!peut(session, 'progression.lire_classe', { classeId: id }).autorise) {
    redirect('/formateur')
  }

  const suivi = await chargerSuivi(classeId)
  if (!suivi.ok) notFound()

  const { nomClasse, grille, index, couverture, bloquantes, aRelancer, jamaisVenus } =
    suivi.valeur

  // Une Map ne traverse pas la frontière serveur/client : on l'aplatit ici.
  const niveaux = Object.fromEntries(index)

  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-10">
      <nav>
        <Link href="/formateur" className="text-sm text-mine-doux underline">
          ← Mes leçons
        </Link>
      </nav>

      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">{nomClasse}</h1>
        <div className="flex gap-2" role="group" aria-label="Exporter la grille">
          {(['csv', 'xlsx', 'pdf'] as const).map((format) => (
            <a
              key={format}
              href={`/api/v1/exports/classe/${classeId}?format=${format}`}
              className="rounded-carte border border-bordure px-4 py-2 text-sm"
            >
              Exporter en {format.toUpperCase()}
            </a>
          ))}
        </div>
      </header>

      {/* Les deux signalements passent AVANT la grille : ce sont eux qui
          demandent une action, la grille est de la consultation. */}
      {aRelancer.length > 0 ? (
        <p className="rounded-carte border border-alerte/30 bg-alerte-douce px-4 py-3">
          <strong className="font-medium">
            {aRelancer.length} élève{aRelancer.length > 1 ? 's' : ''} sans connexion depuis
            plus de {JOURS_AVANT_SIGNALEMENT} jours :
          </strong>{' '}
          {aRelancer.map((a) => `${a.prenom} ${a.initialeNom}.`).join(', ')}
        </p>
      ) : null}

      {jamaisVenus.length > 0 ? (
        <p className="rounded-carte border border-bordure px-4 py-3 text-mine-doux">
          {jamaisVenus.length} élève{jamaisVenus.length > 1 ? 's ne se sont' : ' ne s’est'}{' '}
          jamais connecté{jamaisVenus.length > 1 ? 's' : ''} :{' '}
          {jamaisVenus.map((a) => `${a.prenom} ${a.initialeNom}.`).join(', ')}. Vérifie que
          les identifiants ont bien été distribués.
        </p>
      ) : null}

      <section className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        <div className="rounded-carte border border-bordure px-4 py-4">
          <p className="text-sm text-mine-doux">Couverture du référentiel</p>
          <p className="text-2xl font-semibold tabular-nums">
            {Math.round(couverture * 100)} %
          </p>
          <p className="text-sm text-mine-doux">
            Compétences abordées par au moins un élève.
          </p>
        </div>

        <div className="rounded-carte border border-bordure px-4 py-4">
          <p className="text-sm text-mine-doux">Avancement moyen</p>
          <p className="text-2xl font-semibold tabular-nums">
            {grille.apprenants.length === 0
              ? 0
              : Math.round(
                  (grille.apprenants.reduce(
                    (total, a) => total + avancement(grille, index, a.id),
                    0,
                  ) /
                    grille.apprenants.length) *
                    100,
                )}{' '}
            %
          </p>
          <p className="text-sm text-mine-doux">Compétences validées par élève.</p>
        </div>
      </section>

      {bloquantes.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-mine-doux">
            Compétences sur lesquelles la classe bloque
          </h2>
          <ul className="flex flex-col gap-1">
            {bloquantes.slice(0, 3).map(({ competence, partValidee }) => (
              <li key={competence.id} className="text-sm">
                <span className="font-medium">{competence.code}</span> — {competence.intitule}{' '}
                <span className="text-mine-doux">
                  ({Math.round(partValidee * 100)} % de la classe)
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Grille
        classeId={classeId}
        apprenants={grille.apprenants}
        competences={grille.competences}
        niveaux={niveaux}
      />
    </main>
  )
}
