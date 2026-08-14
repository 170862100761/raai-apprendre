import Link from 'next/link'
import { redirect } from 'next/navigation'
import { peut } from '@/domaines/identite'
import { consulterAbonnement, type StatutAbonnement } from '@/domaines/facturation'
import { exigerSession } from '../../_session'
import { facturationConfiguree } from '../../_facturation'
import { BoutonsAbonnement } from './_boutons'

export const metadata = { title: 'Abonnement — RAAI Apprendre' }
export const dynamic = 'force-dynamic'

const LIBELLES: Record<StatutAbonnement, string> = {
  inexistant: 'Aucun abonnement',
  active: 'Actif',
  impayee: 'Paiement en attente',
  annulee: 'Résilié',
}

export default async function PageAbonnement({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>
}) {
  const session = await exigerSession()
  if (!peut(session, 'etablissement.gerer').autorise || !session.etablissementId) {
    redirect('/formateur')
  }

  const { statut: retour } = await searchParams
  const facturation = facturationConfiguree()

  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <nav>
        <Link href="/administration" className="text-sm text-mine-doux underline">
          ← Administration
        </Link>
      </nav>
      <h1 className="text-2xl font-semibold">Abonnement</h1>

      {retour === 'merci' ? (
        <p className="rounded-carte border border-bordure bg-surface px-4 py-3">
          Merci ! L’abonnement sera visible ici dans quelques instants, le temps
          que la confirmation de paiement nous parvienne.
        </p>
      ) : null}

      {!facturation ? (
        <p className="rounded-carte border border-bordure bg-surface px-4 py-6 text-mine-doux">
          La facturation n’est pas configurée sur cette instance. Renseigner
          les trois variables Stripe (voir la documentation de déploiement)
          pour activer la souscription.
        </p>
      ) : (
        <Etat etablissementId={session.etablissementId} facturation={facturation} />
      )}
    </main>
  )
}

async function Etat({
  etablissementId,
  facturation,
}: {
  etablissementId: NonNullable<Awaited<ReturnType<typeof exigerSession>>['etablissementId']>
  facturation: NonNullable<ReturnType<typeof facturationConfiguree>>
}) {
  const resultat = await consulterAbonnement(etablissementId, facturation)
  if (!resultat.ok) return null
  const etat = resultat.valeur

  return (
    <section className="flex flex-col gap-4">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 rounded-carte border border-bordure bg-surface px-4 py-4">
        <dt className="text-sm text-mine-doux">Statut</dt>
        <dd className="font-medium">{LIBELLES[etat.statut]}</dd>
        <dt className="text-sm text-mine-doux">Sièges payés</dt>
        <dd>{etat.sieges}</dd>
        <dt className="text-sm text-mine-doux">Élèves inscrits</dt>
        <dd>{etat.inscrits}</dd>
        {etat.periodeFinLe ? (
          <>
            <dt className="text-sm text-mine-doux">Période en cours jusqu’au</dt>
            <dd>{etat.periodeFinLe.toLocaleDateString('fr-FR')}</dd>
          </>
        ) : null}
      </dl>

      {etat.siegesManquants > 0 && etat.statut === 'active' ? (
        <p className="rounded-carte border border-bordure bg-surface px-4 py-3">
          {etat.siegesManquants} élève{etat.siegesManquants > 1 ? 's' : ''} au-delà
          des sièges payés. Aucun accès n’est coupé — ajuste le nombre de sièges
          depuis « Gérer l’abonnement ».
        </p>
      ) : null}

      <BoutonsAbonnement statut={etat.statut} />
    </section>
  )
}
