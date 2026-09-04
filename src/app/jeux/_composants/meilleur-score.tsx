'use client'

import { useEffect, useState } from 'react'
import { meilleurScore } from './scores'

/**
 * Lu après le montage : le serveur ne connaît pas le navigateur de l'élève,
 * et un rendu qui prétendrait le contraire produirait un écart d'hydratation.
 */
export function MeilleurScore({ cle }: { cle: string }) {
  const [libelle, setLibelle] = useState<string | null>(null)

  useEffect(() => {
    setLibelle(meilleurScore(cle)?.libelle ?? null)
  }, [cle])

  if (!libelle) return <span className="text-sm text-mine-doux">Pas encore joué</span>
  return <span className="text-sm tabular-nums text-accent">Meilleur : {libelle}</span>
}
