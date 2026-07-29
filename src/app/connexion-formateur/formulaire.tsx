'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { connecterFormateur, type EtatConnexion } from './actions'

function Bouton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-carte bg-accent px-4 py-3 font-medium text-accent-contraste
                 transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? 'Connexion…' : 'Se connecter'}
    </button>
  )
}

export function FormulaireFormateur({ suite }: { suite?: string }) {
  const [etat, action] = useActionState<EtatConnexion, FormData>(connecterFormateur, {})

  return (
    <form action={action} className="flex flex-col gap-5">
      {suite ? <input type="hidden" name="suite" value={suite} /> : null}
      <div className="flex flex-col gap-2">
        <label htmlFor="email" className="text-sm font-medium">
          Adresse e-mail
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="rounded-carte border border-bordure bg-surface px-4 py-3 text-base"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="motDePasse" className="text-sm font-medium">
          Mot de passe
        </label>
        <input
          id="motDePasse"
          name="motDePasse"
          type="password"
          autoComplete="current-password"
          required
          className="rounded-carte border border-bordure bg-surface px-4 py-3 text-base"
        />
      </div>

      {etat.erreur ? (
        <p
          role="alert"
          className="rounded-carte border border-alerte/30 bg-alerte-douce px-4 py-3 text-sm text-alerte"
        >
          {etat.erreur}
        </p>
      ) : null}

      <Bouton />
    </form>
  )
}
