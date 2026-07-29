import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/noyau/prisma'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantTentative } from '@/noyau/identifiants'
import {
  chargerCopie,
  depotEvaluationPrisma,
  listerCopiesEnAttente,
} from '@/domaines/evaluation'
import { peut } from '@/domaines/identite'
import { exigerSession } from '../../_session'
import { FormulaireCorrection } from './_formulaire'

export const metadata = { title: 'Copies à corriger — RAAI Apprendre' }
export const dynamic = 'force-dynamic'

/**
 * La pile de copies rédigées qui attendent un enseignant.
 *
 * Sans cet écran, `attente_correction` était un cul-de-sac : le domaine y
 * plaçait toute copie contenant une réponse rédigée, et rien ne l'en sortait
 * jamais. Un élève pouvait rendre un devoir et ne recevoir aucune note.
 */
export default async function PageCorrections({
  searchParams,
}: {
  searchParams: Promise<{ copie?: string }>
}) {
  const session = await exigerSession()

  if (!peut(session, 'evaluation.corriger').autorise) redirect('/aujourdhui')
  if (!session.etablissementId) redirect('/connexion-formateur')

  const depot = depotEvaluationPrisma(prisma)
  const pile = await listerCopiesEnAttente(session.etablissementId, depot)
  const { copie: copieDemandee } = await searchParams

  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-wrap items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">Copies à corriger</h1>
        <Link href="/formateur" className="text-sm underline">
          Mes leçons
        </Link>
      </header>

      {pile.length === 0 ? (
        <p className="rounded-carte border border-bordure px-4 py-6 text-center text-mine-doux">
          Aucune copie n’attend de correction. Les réponses rédigées arrivent ici
          dès qu’un élève rend un devoir.
        </p>
      ) : (
        <section className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-mine-doux">
            {pile.length} copie{pile.length > 1 ? 's' : ''} en attente
          </h2>
          <ul className="flex flex-col gap-2">
            {pile.map((c) => {
              const ouverte = c.tentativeId === copieDemandee
              return (
                <li key={c.tentativeId}>
                  <Link
                    href={ouverte ? '/formateur/corrections' : `?copie=${c.tentativeId}`}
                    aria-current={ouverte ? 'true' : undefined}
                    className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1
                                rounded-carte border px-4 py-3 hover:bg-surface-2 ${
                                  ouverte ? 'border-accent bg-accent-doux' : 'border-bordure'
                                }`}
                  >
                    <span className="font-medium">
                      {c.prenom} {c.initialeNom}.
                    </span>
                    <span className="text-sm text-mine-doux">
                      {c.evaluationTitre} · {c.chapitre}
                    </span>
                    <span className="text-sm tabular-nums text-mine-doux">
                      {c.aNoter} à noter{c.soumiseLe ? ` · rendu ${enJours(c.soumiseLe)}` : ''}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {copieDemandee && <Copie tentativeId={copieDemandee} etablissementId={session.etablissementId} />}
    </main>
  )
}

async function Copie({
  tentativeId,
  etablissementId,
}: {
  tentativeId: string
  etablissementId: string
}) {
  const depot = depotEvaluationPrisma(prisma)
  const resultat = await chargerCopie(identifiant<IdentifiantTentative>(tentativeId), depot)

  if (!resultat.ok) {
    return <p className="text-sm text-alerte">{resultat.erreur.message}</p>
  }

  // La RLS cloisonne déjà ; cette vérification-ci empêche qu'un identifiant
  // deviné ouvre la copie d'un autre établissement en lecture.
  if (resultat.valeur.etablissementId !== etablissementId) {
    return <p className="text-sm text-alerte">Copie introuvable.</p>
  }

  return <FormulaireCorrection copie={resultat.valeur} />
}

/**
 * Depuis combien de temps la copie attend.
 *
 * En jours, pas en date : « rendu il y a 12 jours » dit qu'il faut s'en
 * occuper, « rendu le 17/09 » demande un calcul mental.
 */
function enJours(date: Date): string {
  const minuit = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const jours = Math.round((minuit(new Date()) - minuit(date)) / 86_400_000)

  if (jours <= 0) return "aujourd'hui"
  if (jours === 1) return 'hier'
  return `il y a ${jours} jours`
}
