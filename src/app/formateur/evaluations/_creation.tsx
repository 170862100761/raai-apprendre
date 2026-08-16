'use client'

import { useActionState } from 'react'
import type { Chapitre } from '@/domaines/catalogue'
import { creer, type EtatEvaluation } from './actions'

export function FormulaireCreation({ chapitres }: { chapitres: readonly Chapitre[] }) {
  const [etat, action, enCours] = useActionState<EtatEvaluation, FormData>(creer, {})

  return (
    <form
      action={action}
      className="flex flex-col gap-3 rounded-carte border border-bordure bg-surface p-4"
    >
      <h2 className="font-semibold">Nouvelle évaluation</h2>

      <div className="flex flex-wrap gap-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          Titre
          <input
            name="titre"
            required
            minLength={3}
            className="rounded-carte border border-bordure bg-surface-2 px-3 py-2"
          />
          {etat.champs?.titre ? <span className="text-alerte">{etat.champs.titre}</span> : null}
        </label>

        <label className="flex flex-col gap-1 text-sm">
          Type
          <select name="type" className="rounded-carte border border-bordure bg-surface-2 px-3 py-2">
            <option value="quiz">Quiz auto-corrigé</option>
            <option value="exercice">Exercice</option>
            <option value="devoir">Devoir à rendre</option>
            <option value="tp">TP</option>
          </select>
        </label>

        <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
          Chapitre
          <select
            name="chapitreId"
            required
            className="rounded-carte border border-bordure bg-surface-2 px-3 py-2"
          >
            {chapitres.map((c) => (
              <option key={c.id} value={c.id}>
                {c.matiere} · {c.titre}
              </option>
            ))}
          </select>
          {etat.champs?.chapitreId ? (
            <span className="text-alerte">{etat.champs.chapitreId}</span>
          ) : null}
        </label>
      </div>

      {etat.erreur ? (
        <p role="alert" className="text-sm text-alerte">
          {etat.erreur}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={enCours}
        className="w-fit rounded-carte bg-accent px-5 py-2 font-medium text-accent-contraste
                   disabled:opacity-60"
      >
        {enCours ? 'Création…' : 'Créer en brouillon'}
      </button>
    </form>
  )
}
