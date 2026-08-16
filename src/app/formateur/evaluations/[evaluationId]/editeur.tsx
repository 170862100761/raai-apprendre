'use client'

import { useActionState, useState } from 'react'
import type { EvaluationEnEdition } from '@/domaines/evaluation'
import { depublier, enregistrer, publier, type EtatEvaluation } from '../actions'

/**
 * Éditeur d'évaluation.
 *
 * Le corrigé est visible et saisi ici — c'est l'auteur qui écrit, pas l'élève
 * qui passe. La règle « le corrigé ne sort jamais » protège le passage, et
 * elle est tenue par la projection élève, pas par cet écran.
 */

type QuestionLocale = {
  intitule: string
  type: 'qcm' | 'vrai_faux' | 'numerique' | 'texte_court' | 'texte_long'
  propositions: string[]
  bonnes: number[]
  bonne: boolean
  valeur: string
  tolerance: string
  unite: string
  acceptees: string
  bareme: string
}

const NEUVE: QuestionLocale = {
  intitule: '',
  type: 'qcm',
  propositions: ['', ''],
  bonnes: [],
  bonne: true,
  valeur: '',
  tolerance: '0',
  unite: '',
  acceptees: '',
  bareme: '2',
}

function depuisEdition(evaluation: EvaluationEnEdition): QuestionLocale[] {
  return evaluation.questions.map((q) => {
    const base: QuestionLocale = { ...NEUVE, intitule: q.intitule, bareme: String(q.bareme) }
    switch (q.enonce.type) {
      case 'qcm':
        return {
          ...base,
          type: 'qcm',
          propositions: [...q.enonce.propositions],
          bonnes: q.corrige.type === 'qcm' ? [...q.corrige.bonnes] : [],
        }
      case 'vrai_faux':
        return { ...base, type: 'vrai_faux', bonne: q.corrige.type === 'vrai_faux' ? q.corrige.bonne : true }
      case 'numerique':
        return {
          ...base,
          type: 'numerique',
          unite: q.enonce.unite ?? '',
          valeur: q.corrige.type === 'numerique' ? String(q.corrige.valeur) : '',
          tolerance: q.corrige.type === 'numerique' ? String(q.corrige.tolerance) : '0',
        }
      case 'texte_court':
        return {
          ...base,
          type: 'texte_court',
          acceptees: q.corrige.type === 'texte_court' ? q.corrige.acceptees.join(' | ') : '',
        }
      default:
        return { ...base, type: 'texte_long' }
    }
  })
}

/** Vers le format attendu par le cas d'usage (énoncé + corrigé du domaine). */
function versSaisie(q: QuestionLocale) {
  const bareme = Number(q.bareme.replace(',', '.'))
  switch (q.type) {
    case 'qcm':
      return {
        intitule: q.intitule,
        enonce: { type: 'qcm', propositions: q.propositions.filter((p) => p.trim() !== '') },
        corrige: { type: 'qcm', bonnes: q.bonnes },
        bareme,
      }
    case 'vrai_faux':
      return {
        intitule: q.intitule,
        enonce: { type: 'vrai_faux' },
        corrige: { type: 'vrai_faux', bonne: q.bonne },
        bareme,
      }
    case 'numerique':
      return {
        intitule: q.intitule,
        enonce: { type: 'numerique', ...(q.unite.trim() ? { unite: q.unite.trim() } : {}) },
        corrige: {
          type: 'numerique',
          valeur: Number(q.valeur.replace(',', '.')),
          tolerance: Number(q.tolerance.replace(',', '.')) || 0,
        },
        bareme,
      }
    case 'texte_court':
      return {
        intitule: q.intitule,
        enonce: { type: 'texte_court' },
        corrige: {
          type: 'texte_court',
          acceptees: q.acceptees.split('|').map((a) => a.trim()).filter((a) => a !== ''),
        },
        bareme,
      }
    default:
      return {
        intitule: q.intitule,
        enonce: { type: 'texte_long' },
        corrige: { type: 'texte_long' },
        bareme,
      }
  }
}

const champ = 'rounded-carte border border-bordure bg-surface-2 px-3 py-2'

export function Editeur({ evaluation }: { evaluation: EvaluationEnEdition }) {
  const [titre, setTitre] = useState(evaluation.titre)
  const [questions, setQuestions] = useState<QuestionLocale[]>(() => depuisEdition(evaluation))

  const [etatSauvegarde, sauvegarder, sauvegardeEnCours] = useActionState<EtatEvaluation, FormData>(
    enregistrer,
    {},
  )
  const [etatStatut, changerStatut, statutEnCours] = useActionState<EtatEvaluation, FormData>(
    evaluation.statut === 'publiee' ? depublier : publier,
    {},
  )

  const changer = (rang: number, patch: Partial<QuestionLocale>) =>
    setQuestions((qs) => qs.map((q, i) => (i === rang ? { ...q, ...patch } : q)))

  const message = etatStatut.erreur ?? etatSauvegarde.erreur ?? etatStatut.message ?? etatSauvegarde.message

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <input
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            aria-label="Titre de l’évaluation"
            className={`${champ} text-xl font-semibold`}
          />
          <p className="text-sm text-mine-doux">
            {evaluation.chapitre} ·{' '}
            {evaluation.statut === 'publiee' ? 'Publiée — visible des élèves' : 'Brouillon'}
          </p>
        </div>

        <div className="flex gap-2">
          <form action={sauvegarder}>
            <input type="hidden" name="evaluationId" value={evaluation.id} />
            <input type="hidden" name="titre" value={titre} />
            <input
              type="hidden"
              name="questions"
              value={JSON.stringify(questions.map(versSaisie))}
            />
            <button
              type="submit"
              disabled={sauvegardeEnCours}
              className="rounded-carte bg-accent px-5 py-2 font-medium text-accent-contraste
                         disabled:opacity-60"
            >
              {sauvegardeEnCours ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </form>
          <form action={changerStatut}>
            <input type="hidden" name="evaluationId" value={evaluation.id} />
            <button
              type="submit"
              disabled={statutEnCours}
              className="rounded-carte border border-bordure px-5 py-2 font-medium
                         disabled:opacity-60"
            >
              {evaluation.statut === 'publiee' ? 'Repasser en brouillon' : 'Publier'}
            </button>
          </form>
        </div>
      </header>

      {message ? (
        <p role="status" aria-live="polite" className="text-sm text-mine-doux">
          {message}
        </p>
      ) : null}
      {(etatSauvegarde.alertes ?? []).map((a) => (
        <p key={a} role="alert" className="rounded-carte border border-alerte/40 bg-alerte-douce px-4 py-2 text-sm text-alerte">
          {a}
        </p>
      ))}

      <ol className="flex flex-col gap-4">
        {questions.map((q, rang) => (
          <li key={rang} className="flex flex-col gap-3 rounded-carte border border-bordure bg-surface p-4">
            <div className="flex flex-wrap items-start gap-3">
              <span className="pt-2 text-sm text-mine-doux">{rang + 1}.</span>
              <textarea
                value={q.intitule}
                onChange={(e) => changer(rang, { intitule: e.target.value })}
                aria-label={`Énoncé de la question ${rang + 1}`}
                placeholder="Énoncé de la question"
                rows={2}
                className={`${champ} min-w-60 flex-1`}
              />
              <select
                value={q.type}
                onChange={(e) => changer(rang, { type: e.target.value as QuestionLocale['type'] })}
                aria-label="Type de question"
                className={champ}
              >
                <option value="qcm">QCM</option>
                <option value="vrai_faux">Vrai / Faux</option>
                <option value="numerique">Numérique</option>
                <option value="texte_court">Texte court</option>
                <option value="texte_long">Rédaction (corrigée par toi)</option>
              </select>
              <label className="flex items-center gap-1 text-sm text-mine-doux">
                Barème
                <input
                  value={q.bareme}
                  onChange={(e) => changer(rang, { bareme: e.target.value })}
                  inputMode="decimal"
                  className={`${champ} w-16`}
                />
              </label>
              <button
                type="button"
                onClick={() => setQuestions((qs) => qs.filter((_, i) => i !== rang))}
                aria-label={`Supprimer la question ${rang + 1}`}
                className="text-sm text-alerte underline"
              >
                Supprimer
              </button>
            </div>

            {q.type === 'qcm' ? (
              <div className="flex flex-col gap-1 pl-6">
                <p className="text-sm text-mine-doux">
                  Coche la ou les bonnes réponses. Barème partiel automatique.
                </p>
                {q.propositions.map((p, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={q.bonnes.includes(i)}
                      onChange={(e) =>
                        changer(rang, {
                          bonnes: e.target.checked
                            ? [...q.bonnes, i]
                            : q.bonnes.filter((b) => b !== i),
                        })
                      }
                      aria-label={`Proposition ${i + 1} correcte`}
                    />
                    <input
                      value={p}
                      onChange={(e) =>
                        changer(rang, {
                          propositions: q.propositions.map((x, j) => (j === i ? e.target.value : x)),
                        })
                      }
                      placeholder={`Proposition ${i + 1}`}
                      className={`${champ} flex-1`}
                    />
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => changer(rang, { propositions: [...q.propositions, ''] })}
                  className="w-fit text-sm underline"
                >
                  Ajouter une proposition
                </button>
              </div>
            ) : null}

            {q.type === 'vrai_faux' ? (
              <label className="flex items-center gap-2 pl-6 text-sm">
                Bonne réponse :
                <select
                  value={q.bonne ? 'vrai' : 'faux'}
                  onChange={(e) => changer(rang, { bonne: e.target.value === 'vrai' })}
                  className={champ}
                >
                  <option value="vrai">Vrai</option>
                  <option value="faux">Faux</option>
                </select>
              </label>
            ) : null}

            {q.type === 'numerique' ? (
              <div className="flex flex-wrap gap-3 pl-6 text-sm">
                <label className="flex items-center gap-2">
                  Valeur attendue
                  <input
                    value={q.valeur}
                    onChange={(e) => changer(rang, { valeur: e.target.value })}
                    inputMode="decimal"
                    className={`${champ} w-28`}
                  />
                </label>
                <label className="flex items-center gap-2">
                  Tolérance ±
                  <input
                    value={q.tolerance}
                    onChange={(e) => changer(rang, { tolerance: e.target.value })}
                    inputMode="decimal"
                    className={`${champ} w-20`}
                  />
                </label>
                <label className="flex items-center gap-2">
                  Unité
                  <input
                    value={q.unite}
                    onChange={(e) => changer(rang, { unite: e.target.value })}
                    className={`${champ} w-20`}
                  />
                </label>
              </div>
            ) : null}

            {q.type === 'texte_court' ? (
              <label className="flex flex-col gap-1 pl-6 text-sm">
                Réponses acceptées, séparées par « | » (accents et majuscules ignorés)
                <input
                  value={q.acceptees}
                  onChange={(e) => changer(rang, { acceptees: e.target.value })}
                  placeholder="litres par minute | L/min"
                  className={champ}
                />
              </label>
            ) : null}

            {q.type === 'texte_long' ? (
              <p className="pl-6 text-sm text-mine-doux">
                Réponse rédigée : aucune note automatique, la copie arrivera dans
                « Copies à corriger ».
              </p>
            ) : null}
          </li>
        ))}
      </ol>

      <button
        type="button"
        onClick={() => setQuestions((qs) => [...qs, { ...NEUVE, propositions: ['', ''] }])}
        className="w-fit rounded-carte border border-bordure px-5 py-2 font-medium"
      >
        Ajouter une question
      </button>

      <p className="text-sm text-mine-doux">
        Pense à enregistrer avant de publier : la publication prend ce qui est
        en base, pas ce qui est à l’écran.
      </p>
    </div>
  )
}
