'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { QuestionQuiz } from './types'
import { enregistrerScore } from './scores'
import { Anneau, BarreTemps, BoutonPrincipal, Carte, Lettre, LETTRES } from './ui'

const TEMPS = 15

/** Quiz éclair : 100 points par bonne réponse, plus un bonus de vitesse. */
export function QuizEclair({ cle, questions }: { cle: string; questions: QuestionQuiz[] }) {
  const [phase, setPhase] = useState<'attente' | 'jeu' | 'fini'>('attente')
  const [index, setIndex] = useState(0)
  const [points, setPoints] = useState(0)
  const [justes, setJustes] = useState(0)
  const [serie, setSerie] = useState(0)
  const [meilleureSerie, setMeilleureSerie] = useState(0)
  const [reste, setReste] = useState(TEMPS)
  const [choisi, setChoisi] = useState<number | null>(null)
  const [flash, setFlash] = useState<{ texte: string; ok: boolean } | null>(null)

  const minuterie = useRef<ReturnType<typeof setInterval> | null>(null)

  const stop = () => {
    if (minuterie.current) clearInterval(minuterie.current)
    minuterie.current = null
  }

  const suivante = useCallback(() => {
    setIndex((i) => {
      if (i >= questions.length - 1) {
        setPhase('fini')
        return i
      }
      setChoisi(null)
      setFlash(null)
      setReste(TEMPS)
      return i + 1
    })
  }, [questions.length])

  useEffect(() => {
    if (phase !== 'jeu' || choisi !== null || flash) return
    minuterie.current = setInterval(() => {
      setReste((t) => {
        const n = Math.round((t - 0.1) * 10) / 10
        if (n > 0) return n
        stop()
        setSerie(0)
        setFlash({ texte: 'Temps écoulé !', ok: false })
        return 0
      })
    }, 100)
    return stop
  }, [phase, choisi, flash])

  useEffect(() => {
    if (!flash) return
    const t = setTimeout(suivante, 1300)
    return () => clearTimeout(t)
  }, [flash, suivante])

  useEffect(() => {
    if (phase === 'fini') enregistrerScore(cle, points, `${points} pts`)
  }, [phase, cle, points])

  function demarrer() {
    setPhase('jeu')
    setIndex(0)
    setPoints(0)
    setJustes(0)
    setSerie(0)
    setMeilleureSerie(0)
    setReste(TEMPS)
    setChoisi(null)
    setFlash(null)
  }

  function repondre(i: number) {
    if (choisi !== null || flash) return
    const q = questions[index]
    if (!q) return
    stop()
    const ok = i === q.answer
    const bonusVitesse = ok ? Math.round(Math.max(0, reste) * 6) : 0
    const gagne = ok ? 100 + bonusVitesse : 0

    setChoisi(i)
    setPoints((p) => p + gagne)
    if (ok) {
      setJustes((n) => n + 1)
      setSerie((s) => {
        setMeilleureSerie((m) => Math.max(m, s + 1))
        return s + 1
      })
    } else {
      setSerie(0)
    }
    setFlash({
      ok,
      texte:
        (ok
          ? `+${gagne} pts${bonusVitesse > 0 ? ` (dont +${bonusVitesse} vitesse)` : ''}`
          : 'Raté !') + (q.e ? ` — ${q.e}` : ''),
    })
  }

  if (phase === 'attente') {
    return (
      <Carte className="mx-auto max-w-lg text-center">
        <p className="text-mine-doux">
          {questions.length} questions, {TEMPS} secondes chacune : plus tu réponds vite, plus tu
          marques.
        </p>
        <BoutonPrincipal className="mt-6" onClick={demarrer}>
          Commencer
        </BoutonPrincipal>
      </Carte>
    )
  }

  if (phase === 'fini') {
    return (
      <Carte className="mx-auto max-w-lg text-center">
        <div className="mb-5 flex justify-center">
          <Anneau
            pourcentage={Math.round((justes / questions.length) * 100)}
            libelle={`${points} pts`}
          />
        </div>
        <p className="text-mine-doux">
          {justes} bonne{justes > 1 ? 's' : ''} réponse{justes > 1 ? 's' : ''} sur{' '}
          {questions.length}
          {' · '}meilleure série : {meilleureSerie}
        </p>
        <BoutonPrincipal className="mt-6" onClick={demarrer}>
          Rejouer
        </BoutonPrincipal>
      </Carte>
    )
  }

  const q = questions[index]
  if (!q) return null

  return (
    <Carte className="mx-auto max-w-2xl">
      <div className="mb-3 flex items-center justify-between gap-3 text-sm tabular-nums">
        <span className="text-mine-doux">
          {index + 1}/{questions.length}
        </span>
        <span className="text-accent">{points} pts</span>
        <span className="text-mine-doux">série {serie}</span>
      </div>

      <BarreTemps part={(reste / TEMPS) * 100} />

      <h2 className="mb-5 text-xl font-semibold leading-snug">{q.text}</h2>

      <div className="flex flex-col gap-2">
        {q.choices.map((texte, i) => {
          const bonne = choisi !== null && i === q.answer
          const rate = choisi === i && i !== q.answer
          return (
            <button
              key={i}
              type="button"
              onClick={() => repondre(i)}
              disabled={choisi !== null || !!flash}
              className={`flex items-center gap-3 rounded-carte border px-4 py-3 text-left disabled:cursor-default ${
                bonne
                  ? 'border-accent bg-accent-doux'
                  : rate
                    ? 'border-alerte bg-alerte-douce'
                    : 'border-bordure bg-surface'
              }`}
            >
              <Lettre lettre={LETTRES[i] ?? ''} />
              {texte}
            </button>
          )
        })}
      </div>

      {flash && (
        <p
          className={`mt-4 text-center text-sm font-semibold ${flash.ok ? 'text-accent' : 'text-alerte'}`}
          role="status"
        >
          {flash.texte}
        </p>
      )}
    </Carte>
  )
}
