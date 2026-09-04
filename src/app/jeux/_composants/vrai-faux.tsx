'use client'

import { useEffect, useState } from 'react'
import type { Affirmation } from './types'
import { enregistrerScore } from './scores'
import { Anneau, BoutonPrincipal, Carte } from './ui'

/** Vrai / Faux : chaque réponse est expliquée, y compris quand elle est juste. */
export function VraiFaux({ cle, affirmations }: { cle: string; affirmations: Affirmation[] }) {
  const [index, setIndex] = useState(0)
  const [score, setScore] = useState(0)
  const [repondu, setRepondu] = useState<{ ok: boolean } | null>(null)
  const [fini, setFini] = useState(false)

  const total = affirmations.length
  const a = affirmations[index]

  useEffect(() => {
    if (fini) enregistrerScore(cle, score, `${score}/${total}`)
  }, [fini, cle, score, total])

  function repondre(valeur: boolean) {
    if (repondu || !a) return
    const ok = a.v === valeur
    setRepondu({ ok })
    if (ok) setScore((s) => s + 1)
  }

  function suivante() {
    if (index === total - 1) {
      setFini(true)
      return
    }
    setIndex((i) => i + 1)
    setRepondu(null)
  }

  if (fini) {
    const pct = Math.round((score / total) * 100)
    return (
      <Carte className="mx-auto max-w-lg text-center">
        <div className="mb-5 flex justify-center">
          <Anneau pourcentage={pct} libelle={`${score}/${total}`} />
        </div>
        <h2 className="text-xl font-semibold">
          {pct === 100 ? 'Sans faute !' : pct >= 60 ? 'Bien joué' : 'À retravailler'}
        </h2>
        <BoutonPrincipal
          className="mt-6"
          onClick={() => {
            setIndex(0)
            setScore(0)
            setRepondu(null)
            setFini(false)
          }}
        >
          Rejouer
        </BoutonPrincipal>
      </Carte>
    )
  }

  if (!a) return null

  return (
    <Carte className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between gap-3 text-sm tabular-nums">
        <span className="text-mine-doux">
          {index + 1}/{total}
        </span>
        <span className="text-accent">
          {score} pt{score > 1 ? 's' : ''}
        </span>
      </div>

      <p className="mb-6 text-lg font-medium leading-relaxed">{a.s}</p>

      <div className="grid grid-cols-2 gap-3">
        {[
          { libelle: 'Vrai', valeur: true },
          { libelle: 'Faux', valeur: false },
        ].map((b) => {
          const designee = repondu && a.v === b.valeur
          return (
            <button
              key={b.libelle}
              type="button"
              onClick={() => repondre(b.valeur)}
              disabled={!!repondu}
              className={`rounded-carte border py-3.5 font-semibold disabled:cursor-default ${
                designee ? 'border-accent bg-accent-doux text-accent' : 'border-bordure bg-surface'
              }`}
            >
              {b.libelle}
            </button>
          )
        })}
      </div>

      {repondu && (
        <>
          <div
            className={`mt-4 rounded-carte border px-4 py-3 ${
              repondu.ok ? 'border-accent/30 bg-accent-doux' : 'border-alerte/30 bg-alerte-douce'
            }`}
            role="status"
          >
            <p className={`mb-1 text-sm font-semibold ${repondu.ok ? 'text-accent' : 'text-alerte'}`}>
              {repondu.ok ? 'Bonne réponse' : `C’était ${a.v ? 'vrai' : 'faux'}`}
            </p>
            <p className="text-sm leading-relaxed">{a.e}</p>
          </div>
          <BoutonPrincipal className="mt-4 w-full" onClick={suivante}>
            {index === total - 1 ? 'Voir mon score' : 'Affirmation suivante'}
          </BoutonPrincipal>
        </>
      )}
    </Carte>
  )
}
