'use client'

import { useActionState } from 'react'
import type { StatutAbonnement } from '@/domaines/facturation'
import { gerer, souscrire, type EtatFacturation } from './actions'

/**
 * Deux boutons, jamais les deux à la fois : « Souscrire » tant qu'aucun
 * abonnement n'est actif, « Gérer » ensuite. Les deux quittent le site vers
 * Stripe — la carte bancaire ne passe jamais par nos écrans.
 */
export function BoutonsAbonnement({ statut }: { statut: StatutAbonnement }) {
  const [etatSouscrire, actionSouscrire, souscritEnCours] = useActionState(
    async (_precedent: EtatFacturation): Promise<EtatFacturation> => souscrire(),
    {},
  )
  const [etatGerer, actionGerer, gereEnCours] = useActionState(
    async (_precedent: EtatFacturation): Promise<EtatFacturation> => gerer(),
    {},
  )

  const erreur = etatSouscrire.erreur ?? etatGerer.erreur

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        {statut !== 'active' ? (
          <form action={actionSouscrire}>
            <button
              type="submit"
              disabled={souscritEnCours}
              className="rounded-carte bg-accent px-5 py-3 font-medium text-accent-contraste
                         disabled:opacity-60"
            >
              {souscritEnCours ? 'Redirection…' : 'Souscrire un abonnement'}
            </button>
          </form>
        ) : null}
        {statut !== 'inexistant' ? (
          <form action={actionGerer}>
            <button
              type="submit"
              disabled={gereEnCours}
              className="rounded-carte border border-bordure px-5 py-3 font-medium
                         disabled:opacity-60"
            >
              {gereEnCours ? 'Redirection…' : 'Gérer l’abonnement'}
            </button>
          </form>
        ) : null}
      </div>
      {erreur ? (
        <p role="alert" className="text-sm text-mine-doux">
          {erreur}
        </p>
      ) : null}
    </div>
  )
}
