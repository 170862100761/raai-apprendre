'use client'

import { useActionState } from 'react'
import { useFormStatus } from 'react-dom'
import type { Chapitre, CompetenceOption } from '@/domaines/catalogue'
import { creer, type EtatEdition } from '../actions'

function Bouton() {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-fit rounded-carte bg-accent px-5 py-3 font-medium text-accent-contraste
                 transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? 'Création…' : 'Créer et ajouter du contenu'}
    </button>
  )
}

export function FormulaireCreation({
  chapitres,
  competences,
}: {
  chapitres: readonly Chapitre[]
  competences: readonly CompetenceOption[]
}) {
  const [etat, action] = useActionState<EtatEdition, FormData>(creer, {})

  if (chapitres.length === 0) {
    return (
      <p className="rounded-carte border border-alerte/30 bg-alerte-douce px-4 py-4 text-sm">
        Aucun chapitre n’existe encore dans ton établissement. Un administrateur
        doit d’abord créer une matière et un chapitre.
      </p>
    )
  }

  return (
    <form action={action} className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <label htmlFor="titre" className="text-sm font-medium">
          Titre de la leçon
        </label>
        <input
          id="titre"
          name="titre"
          required
          className="rounded-carte border border-bordure bg-surface px-4 py-3 text-base"
        />
        {etat.champs?.titre ? (
          <p className="text-sm text-alerte">{etat.champs.titre}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <label htmlFor="chapitreId" className="text-sm font-medium">
          Chapitre
        </label>
        <select
          id="chapitreId"
          name="chapitreId"
          required
          className="rounded-carte border border-bordure bg-surface px-4 py-3 text-base"
        >
          {chapitres.map((chapitre) => (
            <option key={chapitre.id} value={chapitre.id}>
              {chapitre.matiere} — {chapitre.titre}
            </option>
          ))}
        </select>
      </div>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-sm font-medium">
          Compétences travaillées{' '}
          <span className="font-normal text-mine-doux">(au moins une)</span>
        </legend>

        {competences.length === 0 ? (
          <p className="text-sm text-alerte">
            Aucun référentiel n’est rattaché aux formations de ton établissement.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {competences.map((competence) => (
              <li key={competence.id}>
                <label className="flex items-start gap-3 rounded-carte border border-bordure px-4 py-3">
                  <input
                    type="checkbox"
                    name="competences"
                    value={competence.id}
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">{competence.code}</span>{' '}
                    <span className="text-mine-doux">{competence.intitule}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
        {etat.champs?.competences ? (
          <p className="text-sm text-alerte">{etat.champs.competences}</p>
        ) : null}
      </fieldset>

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
