'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Formule } from './types'
import { enregistrerScore } from './scores'
import { Carte, melanger } from './ui'

interface Item extends Formule {
  id: number
}

const TAILLE_MANCHE = 6

/** Association : relier six termes à leur signification. Une manche tirée au sort. */
export function Association({ cle, banque }: { cle: string; banque: Formule[] }) {
  const [gauche, setGauche] = useState<Item[]>([])
  const [droite, setDroite] = useState<Item[]>([])
  const [choisi, setChoisi] = useState<number | null>(null)
  const [trouves, setTrouves] = useState<number[]>([])
  const [erreurs, setErreurs] = useState(0)
  const [rate, setRate] = useState<number | null>(null)

  const nouvelleManche = useCallback(() => {
    const six = melanger(banque)
      .slice(0, TAILLE_MANCHE)
      .map((p, id) => ({ ...p, id }))
    setGauche(six)
    setDroite(melanger(six))
    setChoisi(null)
    setTrouves([])
    setErreurs(0)
    setRate(null)
  }, [banque])

  useEffect(nouvelleManche, [nouvelleManche])

  const gagne = gauche.length > 0 && trouves.length === gauche.length

  useEffect(() => {
    if (gagne) {
      enregistrerScore(
        cle,
        Math.max(0, 100 - erreurs * 10),
        erreurs === 0
          ? `${TAILLE_MANCHE}/${TAILLE_MANCHE} parfait`
          : `${TAILLE_MANCHE}/${TAILLE_MANCHE}, ${erreurs} erreur${erreurs > 1 ? 's' : ''}`,
        { score: Math.max(0, TAILLE_MANCHE - erreurs), scoreMax: TAILLE_MANCHE },
      )
    }
  }, [gagne, cle, erreurs])

  function cliquerDroite(id: number) {
    if (choisi === null || trouves.includes(id) || rate !== null) return
    if (choisi === id) {
      setTrouves((t) => [...t, id])
      setChoisi(null)
      return
    }
    setErreurs((n) => n + 1)
    setRate(id)
    setTimeout(() => {
      setRate(null)
      setChoisi(null)
    }, 600)
  }

  if (!gauche.length) {
    return (
      <Carte className="mx-auto max-w-3xl text-mine-doux" occupe>
        Tirage de la manche…
      </Carte>
    )
  }

  return (
    <Carte className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3 text-sm tabular-nums">
        <span className="text-mine-doux">
          {trouves.length}/{gauche.length} associations
        </span>
        <span className={erreurs ? 'text-alerte' : 'text-mine-doux'}>
          {erreurs} erreur{erreurs > 1 ? 's' : ''}
        </span>
        <button type="button" className="text-sm underline" onClick={nouvelleManche}>
          Nouvelle manche
        </button>
      </div>

      {gagne ? (
        <p
          className="mb-4 rounded-carte border border-accent/30 bg-accent-doux px-4 py-3 text-center font-semibold text-accent"
          role="status"
        >
          {erreurs === 0
            ? 'Manche parfaite !'
            : `Manche terminée avec ${erreurs} erreur${erreurs > 1 ? 's' : ''}.`}
        </p>
      ) : (
        <p className="mb-4 text-center text-sm text-mine-doux">
          Choisis un terme, puis sa signification.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          {gauche.map((it) => {
            const acquis = trouves.includes(it.id)
            const actif = choisi === it.id
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => !acquis && rate === null && setChoisi(it.id)}
                disabled={acquis}
                aria-pressed={actif}
                className={`rounded-carte border px-3.5 py-3 text-left font-medium disabled:cursor-default ${
                  acquis
                    ? 'border-accent bg-accent-doux opacity-65'
                    : actif
                      ? 'border-accent bg-surface-2'
                      : 'border-bordure bg-surface'
                }`}
              >
                {it.f}
              </button>
            )
          })}
        </div>

        <div className="flex flex-col gap-2">
          {droite.map((it) => {
            const acquis = trouves.includes(it.id)
            const faux = rate === it.id
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => cliquerDroite(it.id)}
                disabled={acquis}
                className={`rounded-carte border px-3.5 py-3 text-left text-sm leading-snug disabled:cursor-default ${
                  acquis
                    ? 'border-accent bg-accent-doux opacity-65'
                    : faux
                      ? 'border-alerte bg-alerte-douce'
                      : 'border-bordure bg-surface'
                }`}
              >
                {it.d}
              </button>
            )
          })}
        </div>
      </div>
    </Carte>
  )
}
