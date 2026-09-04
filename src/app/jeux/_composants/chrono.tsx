'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { QuestionChrono } from './types'
import { enregistrerScore } from './scores'
import { Anneau, BarreTemps, BoutonPrincipal, Carte, Lettre, LETTRES } from './ui'

/**
 * Une carte, un compte à rebours par question, une série à ne pas casser :
 * un seul composant sert tous les défis chronométrés.
 */
export function JeuChrono({
  cle,
  titre,
  consigne,
  duree,
  questions,
}: {
  cle: string
  titre: string
  consigne: string
  duree: number
  questions: QuestionChrono[]
}) {
  const [phase, setPhase] = useState<'attente' | 'jeu' | 'fini'>('attente')
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [serie, setSerie] = useState(0)
  const [meilleureSerie, setMeilleureSerie] = useState(0)
  const [reste, setReste] = useState(duree)
  const [retour, setRetour] = useState<{ ok: boolean; texte: string } | null>(null)

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
      setRetour(null)
      setReste(duree)
      return i + 1
    })
  }, [duree, questions.length])

  // Compte à rebours : une question ratée par le temps casse la série.
  useEffect(() => {
    if (phase !== 'jeu' || retour) return
    minuterie.current = setInterval(() => {
      setReste((t) => {
        const n = Math.round((t - 0.1) * 10) / 10
        if (n > 0) return n
        stop()
        setSerie(0)
        setRetour({ ok: false, texte: `Temps écoulé ! ${questions[index]?.e ?? ''}` })
        return 0
      })
    }, 100)
    return stop
  }, [phase, retour, index, questions])

  useEffect(() => {
    if (!retour) return
    const t = setTimeout(suivante, 1400)
    return () => clearTimeout(t)
  }, [retour, suivante])

  useEffect(() => {
    if (phase === 'fini') {
      enregistrerScore(cle, score, `${score}/${questions.length}`, {
        score,
        scoreMax: questions.length,
      })
    }
  }, [phase, cle, score, questions.length])

  function demarrer() {
    setPhase('jeu')
    setIndex(0)
    setScore(0)
    setSerie(0)
    setMeilleureSerie(0)
    setReste(duree)
    setRetour(null)
  }

  function repondre(i: number) {
    if (retour) return
    const q = questions[index]
    if (!q) return
    stop()
    const ok = i === q.a
    setRetour({ ok, texte: `${ok ? 'Exact' : 'Raté'} — ${q.e}` })
    if (ok) {
      setScore((s) => s + 1)
      setSerie((s) => {
        setMeilleureSerie((m) => Math.max(m, s + 1))
        return s + 1
      })
    } else {
      setSerie(0)
    }
  }

  if (phase === 'attente') {
    return (
      <Carte className="mx-auto max-w-lg text-center">
        <h2 className="text-xl font-semibold">{titre}</h2>
        <p className="mt-2 text-mine-doux">{consigne}</p>
        <p className="mt-4 text-sm tabular-nums text-mine-doux">
          {questions.length} questions · {duree} s par question
        </p>
        <BoutonPrincipal className="mt-6" onClick={demarrer}>
          Commencer
        </BoutonPrincipal>
      </Carte>
    )
  }

  if (phase === 'fini') {
    const pct = Math.round((score / questions.length) * 100)
    return (
      <Carte className="mx-auto max-w-lg text-center">
        <div className="mb-5 flex justify-center">
          <Anneau pourcentage={pct} libelle={`${score}/${questions.length}`} />
        </div>
        <h2 className="text-xl font-semibold">
          {pct === 100 ? 'Sans faute !' : pct >= 60 ? 'Bien joué' : 'À retravailler'}
        </h2>
        <p className="mt-2 text-mine-doux">
          Meilleure série : {meilleureSerie} bonne{meilleureSerie > 1 ? 's' : ''} réponse
          {meilleureSerie > 1 ? 's' : ''} d’affilée.
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
        <span className="text-accent">
          {score} pt{score > 1 ? 's' : ''}
        </span>
        <span className={serie >= 3 ? 'font-semibold text-accent' : 'text-mine-doux'}>
          série {serie}
        </span>
      </div>

      <BarreTemps part={(reste / duree) * 100} />

      <div className="mb-4 rounded-carte border border-bordure bg-surface-2 px-5 py-6 text-center text-2xl font-semibold">
        {q.display}
      </div>

      <p className="mb-3 text-center font-semibold">{q.prompt}</p>

      <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
        {q.c.map((texte, i) => {
          const bonne = retour && i === q.a
          const mauvaise = retour && !retour.ok && i !== q.a
          return (
            <button
              key={i}
              type="button"
              onClick={() => repondre(i)}
              disabled={!!retour}
              className={`flex items-center gap-2.5 rounded-carte border px-3.5 py-3 text-left text-sm disabled:cursor-default ${
                bonne ? 'border-accent bg-accent-doux' : 'border-bordure bg-surface'
              } ${mauvaise ? 'opacity-55' : ''}`}
            >
              <Lettre lettre={LETTRES[i] ?? ''} />
              {texte}
            </button>
          )
        })}
      </div>

      {retour && (
        <p
          className={`mt-4 rounded-carte border px-4 py-3 text-sm leading-relaxed ${
            retour.ok ? 'border-accent/30 bg-accent-doux' : 'border-alerte/30 bg-alerte-douce'
          }`}
          role="status"
        >
          {retour.texte}
        </p>
      )}
    </Carte>
  )
}
