'use client'

import { useEffect, useState } from 'react'
import { meilleurScore } from './scores'

/**
 * Le meilleur score en base, quand le serveur en connaît un, prime : il suit
 * l'élève d'un poste à l'autre. Sinon on lit celui du navigateur — après le
 * montage, parce qu'un rendu serveur qui prétendrait le connaître produirait
 * un écart d'hydratation.
 */
export function MeilleurScore({ cle, enBase }: { cle: string; enBase?: string | null }) {
  const [local, setLocal] = useState<string | null>(null)

  useEffect(() => {
    setLocal(meilleurScore(cle)?.libelle ?? null)
  }, [cle])

  const libelle = enBase ?? local
  if (!libelle) return <span className="text-sm text-mine-doux">Pas encore joué</span>
  return <span className="text-sm tabular-nums text-accent">Meilleur : {libelle}</span>
}
