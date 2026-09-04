import { Suspense } from 'react'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/noyau/prisma'
import { chargerParcours, depotCataloguePrisma } from '@/domaines/catalogue'
import {
  chargerEcheances,
  depotEvaluationPrisma,
  libelleEcheance,
  urgence,
  type Echeance,
  type Urgence,
} from '@/domaines/evaluation'
import { peut } from '@/domaines/identite'
import type { IdentifiantApprenant } from '@/noyau/identifiants'
import { exigerSession } from '../_session'
import { BandeauDemo } from '../_composants/bandeau-demo'
import { deconnecter } from '../connexion/actions'

export const metadata = { title: "Aujourd'hui — RAAI Apprendre" }

/**
 * L'écran répond à une seule question : « qu'est-ce que je fais maintenant ? ».
 *
 * Les quatorze blocs du cahier des charges existent tous, mais hiérarchisés —
 * les afficher à plat produirait la saturation qu'on reproche à Moodle.
 */
export default async function PageAujourdhui() {
  const session = await exigerSession()

  // La RLS empêche déjà de lire les données d'autrui. Cette vérification-ci
  // répond à une autre question : cet écran a-t-il un sens pour ce compte ?
  // Un enseignant n'a pas de tableau de bord d'élève, et doit être renvoyé
  // vers le sien plutôt que de voir une page vide.
  const acces = peut(session, 'progression.lire_la_sienne', {
    apprenantId: session.sujetId as IdentifiantApprenant,
  })
  // Un adulte connecté n'a rien à faire ici : on l'envoie chez lui, pas vers
  // une page de connexion qui le renverrait aussitôt ici.
  if (!acces.autorise) redirect('/formateur')

  const apprenant = await prisma.apprenant.findUnique({
    where: { id: session.sujetId as string },
    select: { prenom: true },
  })

  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex max-w-2xl flex-col gap-8 px-6 py-10">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">
          Bonjour {apprenant?.prenom ?? ''}
        </h1>
        <nav className="flex gap-4">
          <Link href="/recherche" className="text-sm underline">
            Rechercher
          </Link>
          <Link href="/jeux" className="text-sm underline">
            Jeux
          </Link>
        </nav>
        <form action={deconnecter}>
          <button type="submit" className="text-sm text-mine-doux underline">
            Se déconnecter
          </button>
        </form>
      </header>

      {/* Les échéances d'abord : un élève qui a un devoir pour demain n'a pas
          besoin qu'on lui propose le chapitre 4 (doc 05 §1). Quand il n'y en a
          aucune, la section ne s'affiche pas du tout et la leçon reprend sa
          place en haut — un bloc vide « Rien à rendre » occuperait l'espace le
          plus précieux de l'écran pour ne rien dire. */}
      <Suspense fallback={null}>
        <ARendre apprenantId={session.sujetId as IdentifiantApprenant} />
      </Suspense>

      <Suspense fallback={<SqueletteAction />}>
        <ActionPrioritaire apprenantId={session.sujetId as IdentifiantApprenant} />
      </Suspense>

      {/* Îlot dynamique : personnel, donc jamais mis en cache CDN. Le reste de
          la page l'est. */}
      <Suspense fallback={<SqueletteProgression />}>
        <Progression apprenantId={session.sujetId as IdentifiantApprenant} />
      </Suspense>
    </main>
  )
}

/**
 * Une seule action mise en avant, en grand, avec sa durée.
 *
 * Le cahier des charges liste quatorze blocs pour cet écran. Les afficher au
 * même niveau produirait exactement la saturation qu'on reproche à Moodle.
 * Ils existent tous — hiérarchisés.
 */
async function ActionPrioritaire({ apprenantId }: { apprenantId: IdentifiantApprenant }) {
  const parcours = await chargerParcours(apprenantId, depotCataloguePrisma(prisma))

  if (parcours.lecons.length === 0) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-mine-doux">À faire maintenant</h2>
        <BandeauDemo>
          Aucun cours n’est encore publié pour ta classe. Tes formateurs les
          ajoutent au fur et à mesure.
        </BandeauDemo>
      </section>
    )
  }

  if (!parcours.prochaine) {
    return (
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium text-mine-doux">À faire maintenant</h2>
        <p className="rounded-carte border border-accent/30 bg-accent-doux px-5 py-6">
          Tu as terminé tous les cours publiés. Rien ne t’attend pour l’instant.
        </p>
      </section>
    )
  }

  const { prochaine } = parcours

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-mine-doux">À faire maintenant</h2>

      <Link
        href={`/cours/${prochaine.id}`}
        className="flex flex-col gap-2 rounded-carte border border-accent/30 bg-accent-doux
                   px-5 py-6 transition-opacity hover:opacity-90"
      >
        <span className="text-sm text-mine-doux">{prochaine.chapitre}</span>
        <span className="text-xl font-semibold">{prochaine.titre}</span>
        <span className="text-sm text-mine-doux">
          {prochaine.dureeEstimeeMin} min
          {prochaine.commencee ? ' · à reprendre' : ''}
        </span>
      </Link>

      <p className="text-sm text-mine-doux">
        {parcours.terminees} cours terminé{parcours.terminees > 1 ? 's' : ''} sur{' '}
        {parcours.lecons.length}
      </p>
    </section>
  )
}

/**
 * Ce qui est à rendre, trois lignes au plus.
 *
 * Le reste vit derrière un dépliant plutôt que derrière une page « toutes mes
 * échéances » : une liste de sept devoirs tient dans l'écran une fois ouverte,
 * et une route de plus à maintenir pour l'afficher serait payée par tout le
 * monde pour servir les cas rares.
 */
async function ARendre({ apprenantId }: { apprenantId: IdentifiantApprenant }) {
  // Un seul instant pour toute la section : deux appels à `new Date()` de part
  // et d'autre de minuit produiraient « aujourd'hui » et « hier » pour la même
  // échéance, dans le même écran.
  const maintenant = new Date()
  const tableau = await chargerEcheances(apprenantId, depotEvaluationPrisma(prisma), maintenant)

  if (tableau.affichees.length === 0) return null

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium text-mine-doux">À rendre</h2>

      <ul className="flex flex-col gap-2">
        {tableau.affichees.map((e) => (
          <li key={e.evaluationId}>
            <LigneEcheance echeance={e} maintenant={maintenant} />
          </li>
        ))}
      </ul>

      {tableau.masquees > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-mine-doux underline">
            Voir {tableau.masquees} autre{tableau.masquees > 1 ? 's' : ''} échéance
            {tableau.masquees > 1 ? 's' : ''}
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {tableau.reste.map((e) => (
              <li key={e.evaluationId}>
                <LigneEcheance echeance={e} maintenant={maintenant} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  )
}

function LigneEcheance({ echeance, maintenant }: { echeance: Echeance; maintenant: Date }) {
  const niveau = urgence(echeance, maintenant)
  const enRetard = niveau === 'depassee'

  return (
    <Link
      href={`/evaluation/${echeance.evaluationId}`}
      className={`flex items-baseline gap-3 rounded-carte border px-4 py-3 transition-opacity
                  hover:opacity-90 ${
                    enRetard ? 'border-alerte/40 bg-alerte-douce' : 'border-bordure'
                  }`}
    >
      {/* Le symbole n'est jamais seul à porter l'information : il est doublé du
          libellé en toutes lettres, juste à droite. Il ne sert qu'à repérer une
          ligne d'un coup d'œil, et reste donc caché aux lecteurs d'écran, qui
          liraient sinon un caractère sans signification. */}
      <span aria-hidden="true" className="text-lg leading-none">
        {SYMBOLE[niveau]}
      </span>

      <span className="flex flex-1 flex-col gap-0.5">
        <span className="text-sm text-mine-doux">
          {LIBELLE_TYPE[echeance.type]} · {echeance.chapitre}
        </span>
        <span className="font-medium">{echeance.titre}</span>
        <span className={`text-sm ${enRetard ? 'text-alerte' : 'text-mine-doux'}`}>
          {/* Le libellé relatif se lit, la date exacte lève l'ambiguïté : ni
              l'un ni l'autre seul ne suffit. */}
          {libelleEcheance(echeance, maintenant)} — {dateExacte(echeance.echeanceLe)}
        </span>
      </span>
    </Link>
  )
}

/** Quatre niveaux, quatre symboles — comme la grille de suivi. */
const SYMBOLE: Record<Urgence, string> = {
  depassee: '!',
  aujourdhui: '●',
  demain: '◐',
  cette_semaine: '·',
  plus_tard: '·',
}

const LIBELLE_TYPE: Record<Echeance['type'], string> = {
  exercice: 'Exercice',
  quiz: 'Quiz',
  devoir: 'Devoir',
  tp: 'TP',
  ccf: 'CCF',
  examen: 'Examen',
}

const FORMAT_DATE = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})

function dateExacte(date: Date): string {
  return FORMAT_DATE.format(date)
}

async function Progression({ apprenantId }: { apprenantId: IdentifiantApprenant }) {
  const acquis = await prisma.acquisCompetence.groupBy({
    by: ['niveau'],
    where: { apprenantId },
    _count: true,
  })

  const parNiveau = Object.fromEntries(acquis.map((a) => [a.niveau, a._count]))
  const validees = (parNiveau['acquise'] ?? 0) + (parNiveau['maitrisee'] ?? 0)
  const enCours = parNiveau['en_cours'] ?? 0
  const total = acquis.reduce((n, a) => n + a._count, 0)

  return (
    <section className="flex flex-col gap-4">
      <h2 className="text-sm font-medium text-mine-doux">Tes compétences</h2>

      {total === 0 ? (
        <p className="rounded-carte border border-bordure px-4 py-6 text-center text-mine-doux">
          Rien à afficher pour l’instant. Tes compétences apparaîtront au fur et
          à mesure de tes cours.
        </p>
      ) : (
        <dl className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
          <Compteur libelle="Validées" valeur={validees} accent />
          <Compteur libelle="En cours" valeur={enCours} />
          <Compteur libelle="À travailler" valeur={total - validees - enCours} />
        </dl>
      )}
    </section>
  )
}

function Compteur({
  libelle,
  valeur,
  accent = false,
}: {
  libelle: string
  valeur: number
  accent?: boolean
}) {
  return (
    <div
      className={`rounded-carte border px-4 py-4 ${
        accent ? 'border-accent/30 bg-accent-doux' : 'border-bordure'
      }`}
    >
      <dt className="text-sm text-mine-doux">{libelle}</dt>
      <dd className="text-2xl font-semibold tabular-nums">{valeur}</dd>
    </div>
  )
}

function SqueletteAction() {
  return (
    <section className="flex flex-col gap-3" aria-busy="true">
      <h2 className="text-sm font-medium text-mine-doux">À faire maintenant</h2>
      <div className="h-[120px] rounded-carte border border-bordure bg-surface-2" />
    </section>
  )
}

function SqueletteProgression() {
  return (
    <section className="flex flex-col gap-4" aria-busy="true">
      <h2 className="text-sm font-medium text-mine-doux">Tes compétences</h2>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[86px] rounded-carte border border-bordure bg-surface-2" />
        ))}
      </div>
    </section>
  )
}

/** Page personnelle : jamais mise en cache, ni côté CDN ni côté navigateur. */
export const dynamic = 'force-dynamic'
