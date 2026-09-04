'use client'

import { useCallback, useEffect, useState } from 'react'
import type { Paire } from './types'
import { enregistrerScore } from './scores'
import { Carte, melanger } from './ui'

interface Carton {
  paire: number
  face: string
  genre: 'sym' | 'nom'
}

const construire = (paires: Paire[]): Carton[] =>
  melanger(
    paires.flatMap((p, i) => [
      { paire: i, face: p.sym, genre: 'sym' as const },
      { paire: i, face: p.name, genre: 'nom' as const },
    ]),
  )

/** Memory : associer chaque symbole à son nom. Le score est le nombre de coups. */
export function Memory({ cle, paires }: { cle: string; paires: Paire[] }) {
  const [jeu, setJeu] = useState<Carton[]>([])
  const [retournees, setRetournees] = useState<number[]>([])
  const [trouvees, setTrouvees] = useState<number[]>([])
  const [coups, setCoups] = useState(0)
  const [bloque, setBloque] = useState(false)

  // Le mélange se fait après le montage : le rendu serveur resterait sinon différent.
  const recommencer = useCallback(() => {
    setJeu(construire(paires))
    setRetournees([])
    setTrouvees([])
    setCoups(0)
    setBloque(false)
  }, [paires])

  useEffect(recommencer, [recommencer])

  const gagne = jeu.length > 0 && trouvees.length === paires.length

  useEffect(() => {
    // Moins de coups = meilleur : on enregistre l'inverse pour garder « le plus grand gagne ».
    // Pour la progression : une partie parfaite fait autant de coups que de
    // paires ; chaque coup de trop en retire un, jusqu'à zéro.
    if (gagne) {
      enregistrerScore(cle, Math.max(0, 200 - coups), `${coups} coups`, {
        score: Math.max(0, 2 * paires.length - coups),
        scoreMax: paires.length,
      })
    }
  }, [gagne, cle, coups, paires.length])

  function retourner(i: number) {
    const carton = jeu[i]
    if (!carton || bloque || retournees.includes(i) || trouvees.includes(carton.paire)) return

    if (retournees.length === 0) {
      setRetournees([i])
      return
    }
    const premier = retournees[0]
    const premierCarton = premier === undefined ? undefined : jeu[premier]
    if (premier === undefined || !premierCarton) return
    const paire = premierCarton.paire === carton.paire && premier !== i
    setRetournees([premier, i])
    setCoups((c) => c + 1)
    setBloque(true)

    setTimeout(
      () => {
        if (paire) setTrouvees((t) => [...t, carton.paire])
        setRetournees([])
        setBloque(false)
      },
      paire ? 350 : 850,
    )
  }

  if (!jeu.length) {
    return (
      <Carte className="mx-auto max-w-3xl text-mine-doux" occupe>
        Préparation du plateau…
      </Carte>
    )
  }

  return (
    <Carte className="mx-auto max-w-3xl">
      <div className="mb-4 flex items-center justify-between gap-3 text-sm tabular-nums">
        <span className="text-mine-doux">
          {trouvees.length}/{paires.length} paires
        </span>
        <span className="text-mine-doux">{coups} coups</span>
        <button type="button" className="text-sm underline" onClick={recommencer}>
          Recommencer
        </button>
      </div>

      {gagne && (
        <p
          className="mb-4 rounded-carte border border-accent/30 bg-accent-doux px-4 py-3 text-center font-semibold text-accent"
          role="status"
        >
          Plateau terminé en {coups} coups.
        </p>
      )}

      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(120px,1fr))]">
        {jeu.map((c, i) => {
          const visible = retournees.includes(i) || trouvees.includes(c.paire)
          const acquise = trouvees.includes(c.paire)
          return (
            <button
              key={i}
              type="button"
              onClick={() => retourner(i)}
              disabled={acquise}
              aria-label={visible ? c.face : 'Carte face cachée'}
              className={`flex min-h-[86px] items-center justify-center rounded-carte border px-2.5 py-3
                          text-center font-semibold leading-tight transition-colors disabled:cursor-default ${
                            acquise
                              ? 'border-accent bg-accent-doux'
                              : visible
                                ? 'border-bordure bg-surface'
                                : 'border-bordure bg-surface-2'
                          } ${c.genre === 'sym' ? 'text-2xl' : 'text-sm'}`}
            >
              {visible ? c.face : <span className="text-xl text-mine-doux">?</span>}
            </button>
          )
        })}
      </div>
    </Carte>
  )
}
