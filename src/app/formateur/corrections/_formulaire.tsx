'use client'

import { useActionState } from 'react'
import type { CopiePourCorrection, QuestionCorrigeable } from '@/domaines/evaluation'
import { enregistrerCorrection, type EtatCorrection } from './actions'

const INITIAL: EtatCorrection = {}

/**
 * La copie d'un élève, question par question, avec le champ de note.
 *
 * Les questions déjà tranchées par la machine sont affichées mais non
 * modifiables : les renoter serait une révision, et une révision passe par une
 * nouvelle tentative. Les montrer quand même évite à l'enseignant de corriger
 * à l'aveugle — il voit ce que l'élève a déjà obtenu.
 */
export function FormulaireCorrection({ copie }: { copie: CopiePourCorrection }) {
  const [etat, action, enCours] = useActionState(enregistrerCorrection, INITIAL)

  const aNoter = copie.questions.filter((q) => q.score === null)
  const dejaNotees = copie.questions.filter((q) => q.score !== null)

  return (
    <form action={action} className="flex flex-col gap-5">
      <input type="hidden" name="tentativeId" value={copie.copie.tentativeId} />

      <div className="flex flex-col gap-1 border-t border-bordure pt-5">
        <h2 className="text-lg font-semibold">
          {copie.prenom} {copie.initialeNom}. — {copie.evaluationTitre}
        </h2>
        <p className="text-sm text-mine-doux">
          {aNoter.length} question{aNoter.length > 1 ? 's' : ''} à noter
          {dejaNotees.length > 0
            ? ` · ${dejaNotees.length} déjà corrigée${dejaNotees.length > 1 ? 's' : ''} automatiquement`
            : ''}
        </p>
      </div>

      {aNoter.map((question) => (
        <Question key={question.questionId} question={question} erreur={etat.champs?.[question.questionId]} />
      ))}

      {dejaNotees.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-mine-doux underline">
            Voir les {dejaNotees.length} question
            {dejaNotees.length > 1 ? 's' : ''} corrigée{dejaNotees.length > 1 ? 's' : ''} automatiquement
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {dejaNotees.map((q) => (
              <li key={q.questionId} className="rounded-carte border border-bordure px-4 py-3">
                <p className="font-medium">{q.intitule}</p>
                <p className="mt-1 text-mine-doux">
                  {reponseLisible(q)} — <span className="tabular-nums">{q.score} / {q.bareme}</span>
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}

      {etat.erreur && (
        <p role="alert" className="rounded-carte border border-alerte/40 bg-alerte-douce px-4 py-3 text-sm text-alerte">
          {etat.erreur}
        </p>
      )}
      {etat.message && (
        <p role="status" className="rounded-carte border border-accent/30 bg-accent-doux px-4 py-3 text-sm">
          {etat.message}
        </p>
      )}

      <button
        type="submit"
        disabled={enCours || aNoter.length === 0}
        className="self-start rounded-carte bg-accent px-5 py-3 font-medium text-accent-contraste
                   disabled:opacity-60"
      >
        {enCours ? 'Enregistrement…' : 'Enregistrer la correction'}
      </button>

      <p className="text-sm text-mine-doux">
        Laisse une note vide pour t’arrêter et reprendre plus tard : la copie
        reste dans la pile.
      </p>
    </form>
  )
}

function Question({
  question,
  erreur,
}: {
  question: QuestionCorrigeable
  erreur?: string | undefined
}) {
  const idNote = `score-${question.questionId}`
  const idCommentaire = `commentaire-${question.questionId}`
  const idErreur = `erreur-${question.questionId}`

  return (
    <fieldset className="flex flex-col gap-3 rounded-carte border border-bordure px-4 py-4">
      <legend className="px-1 text-sm font-medium">{question.intitule}</legend>
      <input type="hidden" name="questionId" value={question.questionId} />

      <div className="flex flex-col gap-1">
        <span className="text-sm text-mine-doux">Réponse de l’élève</span>
        <p className="whitespace-pre-wrap rounded-carte bg-surface-2 px-3 py-2">
          {reponseLisible(question)}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor={idNote} className="text-sm text-mine-doux">
            Note sur {question.bareme}
          </label>
          <input
            id={idNote}
            name={idNote}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            aria-invalid={erreur ? 'true' : undefined}
            aria-describedby={erreur ? idErreur : undefined}
            className="w-28 rounded-carte border px-3 py-2 tabular-nums"
          />
        </div>

        <div className="flex min-w-[16rem] flex-1 flex-col gap-1">
          <label htmlFor={idCommentaire} className="text-sm text-mine-doux">
            Commentaire
          </label>
          <textarea
            id={idCommentaire}
            name={idCommentaire}
            rows={2}
            maxLength={2000}
            className="rounded-carte border px-3 py-2"
          />
        </div>
      </div>

      {erreur && (
        <p id={idErreur} role="alert" className="text-sm text-alerte">
          {erreur}
        </p>
      )}
    </fieldset>
  )
}

/**
 * Ce que l'élève a répondu, en texte.
 *
 * Une réponse absente se dit, elle ne s'affiche pas comme une chaîne vide :
 * l'enseignant doit distinguer « n'a rien écrit » de « bogue d'affichage ».
 */
function reponseLisible(question: QuestionCorrigeable): string {
  const reponse = question.reponse
  if (!reponse) return 'Sans réponse.'

  switch (reponse.type) {
    case 'texte_long':
    case 'texte_court':
      return reponse.texte.trim() === '' ? 'Sans réponse.' : reponse.texte
    case 'numerique':
      return String(reponse.valeur)
    case 'vrai_faux':
      return reponse.valeur ? 'Vrai' : 'Faux'
    case 'qcm':
      return reponse.choisies.length === 0
        ? 'Aucune proposition cochée.'
        : `Propositions ${reponse.choisies.map((i) => i + 1).join(', ')}`
    case 'appariement':
      // `couples[i]` est l'index de droite associé à l'entrée de gauche i.
      // Affiché en numérotation humaine, qui commence à 1.
      return reponse.couples.length === 0
        ? 'Aucun appariement.'
        : reponse.couples.map((droite, gauche) => `${gauche + 1} → ${droite + 1}`).join(' · ')
  }
}
