'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import type { QuestionPourEleve } from '@/domaines/evaluation'
import { rendreCopie, type EtatCopie } from './actions'

/**
 * Passage d'un quiz.
 *
 * Le corrigé n'a jamais traversé le réseau : ce composant ne reçoit que des
 * énoncés. Il ne peut donc pas divulguer ce qu'il n'a pas — et c'est la seule
 * garantie qui tienne, une garantie par construction plutôt que par vigilance.
 */

type Reponses = Record<string, unknown>

function Bouton({ repondues, total }: { repondues: number; total: number }) {
  const { pending } = useFormStatus()

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className="rounded-carte bg-accent px-5 py-3 font-medium text-accent-contraste
                   transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        {pending ? 'Envoi…' : 'Rendre ma copie'}
      </button>
      {/* Prévenir sans empêcher : un élève a le droit de rendre incomplet. */}
      {repondues < total ? (
        <span className="text-sm text-mine-doux">
          {total - repondues} question{total - repondues > 1 ? 's' : ''} sans réponse.
        </span>
      ) : null}
    </div>
  )
}

export function Copie({
  evaluationId,
  questions,
}: {
  evaluationId: string
  questions: readonly QuestionPourEleve[]
}) {
  const [reponses, setReponses] = useState<Reponses>({})
  const [etat, action] = useActionState<EtatCopie, FormData>(rendreCopie, {})

  const rendue = etat.score !== undefined

  if (rendue) {
    return <Resultat etat={etat} questions={questions} />
  }

  const repondre = (questionId: string, valeur: unknown) =>
    setReponses((actuelles) => ({ ...actuelles, [questionId]: valeur }))

  return (
    <form action={action} className="flex flex-col gap-8">
      <input type="hidden" name="evaluationId" value={evaluationId} />
      <input type="hidden" name="copie" value={JSON.stringify(reponses)} />

      <ol className="flex flex-col gap-8">
        {questions.map((question, index) => (
          <li key={question.id} className="flex flex-col gap-3">
            <p className="font-medium">
              {index + 1}. {question.intitule}{' '}
              <span className="font-normal text-mine-doux">
                ({question.bareme} pt{question.bareme > 1 ? 's' : ''})
              </span>
            </p>
            <ChampQuestion
              question={question}
              valeur={reponses[question.id]}
              onChange={(valeur) => repondre(question.id, valeur)}
            />
          </li>
        ))}
      </ol>

      {etat.erreur ? (
        <p
          role="alert"
          className="rounded-carte border border-alerte/30 bg-alerte-douce px-4 py-3 text-sm text-alerte"
        >
          {etat.erreur}
        </p>
      ) : null}

      <Bouton repondues={Object.keys(reponses).length} total={questions.length} />
    </form>
  )
}

function ChampQuestion({
  question,
  valeur,
  onChange,
}: {
  question: QuestionPourEleve
  valeur: unknown
  onChange: (valeur: unknown) => void
}) {
  const { enonce, id } = question

  switch (enonce.type) {
    case 'qcm': {
      const choisies = (valeur as { choisies?: number[] })?.choisies ?? []
      return (
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Réponses possibles</legend>
          {enonce.propositions.map((proposition, i) => (
            <label
              key={i}
              className="flex items-start gap-3 rounded-carte border border-bordure px-4 py-3"
            >
              <input
                type="checkbox"
                checked={choisies.includes(i)}
                onChange={(e) =>
                  onChange({
                    type: 'qcm',
                    choisies: e.target.checked
                      ? [...choisies, i]
                      : choisies.filter((c) => c !== i),
                  })
                }
                className="mt-1"
              />
              <span>{proposition}</span>
            </label>
          ))}
          <p className="text-sm text-mine-doux">
            Plusieurs réponses peuvent être justes.
          </p>
        </fieldset>
      )
    }

    case 'vrai_faux': {
      const actuelle = (valeur as { valeur?: boolean })?.valeur
      return (
        <fieldset className="flex gap-3">
          <legend className="sr-only">Vrai ou faux</legend>
          {[true, false].map((v) => (
            <label
              key={String(v)}
              className="flex items-center gap-2 rounded-carte border border-bordure px-4 py-3"
            >
              <input
                type="radio"
                name={`vf-${id}`}
                checked={actuelle === v}
                onChange={() => onChange({ type: 'vrai_faux', valeur: v })}
              />
              <span>{v ? 'Vrai' : 'Faux'}</span>
            </label>
          ))}
        </fieldset>
      )
    }

    case 'numerique':
      return (
        <label className="flex items-center gap-3">
          <input
            type="text"
            inputMode="decimal"
            value={(valeur as { valeur?: number })?.valeur ?? ''}
            onChange={(e) => {
              const nombre = Number(e.target.value.replace(',', '.'))
              onChange(
                Number.isFinite(nombre) && e.target.value !== ''
                  ? { type: 'numerique', valeur: nombre }
                  : undefined,
              )
            }}
            className="w-40 rounded-carte border border-bordure bg-surface px-4 py-3"
          />
          {enonce.unite ? <span className="text-mine-doux">{enonce.unite}</span> : null}
        </label>
      )

    case 'texte_court':
      return (
        <input
          type="text"
          value={(valeur as { texte?: string })?.texte ?? ''}
          onChange={(e) => onChange({ type: 'texte_court', texte: e.target.value })}
          className="rounded-carte border border-bordure bg-surface px-4 py-3"
        />
      )

    case 'texte_long':
      return (
        <div className="flex flex-col gap-1">
          <textarea
            rows={6}
            value={(valeur as { texte?: string })?.texte ?? ''}
            onChange={(e) => onChange({ type: 'texte_long', texte: e.target.value })}
            className="rounded-carte border border-bordure bg-surface px-4 py-3"
          />
          <p className="text-sm text-mine-doux">
            Cette réponse sera lue et corrigée par ton formateur.
          </p>
        </div>
      )

    case 'appariement': {
      const couples = (valeur as { couples?: number[] })?.couples ?? []
      return (
        <ul className="flex flex-col gap-2">
          {enonce.gauche.map((terme, i) => (
            <li key={i} className="flex flex-wrap items-center gap-3">
              <span className="min-w-40">{terme}</span>
              <select
                value={couples[i] ?? ''}
                onChange={(e) => {
                  const suivants = [...couples]
                  suivants[i] = Number(e.target.value)
                  onChange({ type: 'appariement', couples: suivants })
                }}
                className="rounded-carte border border-bordure bg-surface px-3 py-2"
              >
                <option value="">—</option>
                {enonce.droite.map((cible, j) => (
                  <option key={j} value={j}>
                    {cible}
                  </option>
                ))}
              </select>
            </li>
          ))}
        </ul>
      )
    }
  }
}

function Resultat({
  etat,
  questions,
}: {
  etat: EtatCopie
  questions: readonly QuestionPourEleve[]
}) {
  const score = etat.score ?? 0
  const scoreMax = etat.scoreMax ?? 0
  const part = scoreMax > 0 ? score / scoreMax : 0
  const detail = new Map((etat.parQuestion ?? []).map((q) => [q.questionId, q]))

  return (
    <section className="flex flex-col gap-5">
      <div
        className={`rounded-carte border px-5 py-6 ${
          part >= 0.7 ? 'border-accent/30 bg-accent-doux' : 'border-bordure'
        }`}
      >
        <p className="text-sm text-mine-doux">Ton résultat</p>
        <p className="text-3xl font-semibold tabular-nums">
          {score} / {scoreMax}
        </p>
      </div>

      {etat.attendUnHumain ? (
        <p className="text-mine-doux">
          Une partie de tes réponses sera corrigée par ton formateur. Ce total
          n’est donc pas définitif.
        </p>
      ) : null}

      {/* Ce qui compte pour l'élève n'est pas la note mais ce qu'elle a
          débloqué. On le dit explicitement quand c'est le cas. */}
      {etat.montees && etat.montees.length > 0 ? (
        <p className="rounded-carte border border-accent/30 bg-accent-doux px-4 py-3">
          {etat.montees.length} compétence{etat.montees.length > 1 ? 's ont' : ' a'}{' '}
          progressé grâce à cette évaluation.
        </p>
      ) : (
        <p className="text-mine-doux">
          Aucune compétence n’a changé de niveau cette fois. Ce que tu avais déjà
          validé reste acquis.
        </p>
      )}

      {/* Le détail n'arrive qu'avec la note : c'est la seule fois où le
          « pourquoi » traverse le réseau, et il ne dit jamais la réponse
          attendue elle-même — seulement de quoi comprendre. */}
      {detail.size > 0 ? (
        <ol className="flex flex-col gap-4">
          {questions.map((question, index) => {
            const q = detail.get(question.id)
            if (!q) return null
            const verdict =
              q.score === null
                ? 'À corriger par ton formateur'
                : q.score >= q.bareme
                  ? 'Juste'
                  : q.score > 0
                    ? 'En partie'
                    : 'Faux'
            return (
              <li key={question.id} className="rounded-carte border border-bordure px-4 py-3">
                <p className="flex items-baseline justify-between gap-4">
                  <span className="font-medium">
                    {index + 1}. {question.intitule}
                  </span>
                  <span className="shrink-0 text-sm tabular-nums text-mine-doux">
                    {verdict}
                    {q.score !== null ? ` · ${q.score} / ${q.bareme}` : ''}
                  </span>
                </p>
                {q.explication ? <p className="mt-2 text-sm text-mine-doux">{q.explication}</p> : null}
              </li>
            )
          })}
        </ol>
      ) : null}

      <Link href="/aujourdhui" className="w-fit underline">
        Revenir à Aujourd’hui
      </Link>
    </section>
  )
}
