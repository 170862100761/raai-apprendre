'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import { connecter, type EtatConnexion } from './actions'

function Bouton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-carte bg-accent px-4 py-3 text-base font-medium
                 text-accent-contraste transition-opacity
                 hover:opacity-90 disabled:opacity-60"
    >
      {pending ? 'Connexion…' : 'Se connecter'}
    </button>
  )
}

export function FormulaireConnexion({ suite }: { suite?: string }) {
  const [etat, action] = useActionState<EtatConnexion, FormData>(connecter, {})

  return (
    <form action={action} className="flex flex-col gap-5" noValidate>
      {suite ? <input type="hidden" name="suite" value={suite} /> : null}

      <div className="flex flex-col gap-2">
        <label htmlFor="identifiant" className="text-sm font-medium">
          Ton identifiant
        </label>
        <input
          id="identifiant"
          name="identifiant"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          aria-describedby={etat.champs?.identifiant ? 'erreur-identifiant' : undefined}
          aria-invalid={etat.champs?.identifiant ? true : undefined}
          className="rounded-carte border border-bordure bg-surface px-4 py-3 text-base"
        />
        {etat.champs?.identifiant ? (
          <p id="erreur-identifiant" className="text-sm text-alerte">
            {etat.champs.identifiant}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="code" className="text-sm font-medium">
          Ton code à 4 chiffres
        </label>
        <input
          id="code"
          name="code"
          /* `inputMode` et non `type=number` : sur mobile on veut le pavé
             numérique, sans les flèches ni le défilement à la molette. */
          inputMode="numeric"
          pattern="\d{4}"
          maxLength={4}
          autoComplete="current-password"
          required
          aria-describedby={etat.champs?.code ? 'erreur-code' : undefined}
          aria-invalid={etat.champs?.code ? true : undefined}
          className="rounded-carte border border-bordure bg-surface px-4 py-3
                     text-center text-2xl tracking-[0.5em]"
        />
        {etat.champs?.code ? (
          <p id="erreur-code" className="text-sm text-alerte">
            {etat.champs.code}
          </p>
        ) : null}
      </div>

      {/* `role=alert` : l'erreur doit être annoncée aux lecteurs d'écran, pas
          seulement affichée. */}
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
