'use client'

import { useActionState, useEffect, useRef } from 'react'
import { useFormStatus } from 'react-dom'
import type { IdentifiantApprenant } from '@/noyau/identifiants'
import { marquerLecture, type EtatLecture } from './actions'

function BoutonTerminer({ dejaFait }: { dejaFait: boolean }) {
  const { pending } = useFormStatus()

  return (
    <button
      type="submit"
      disabled={pending || dejaFait}
      className="rounded-carte bg-accent px-5 py-3 font-medium text-accent-contraste
                 transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {dejaFait ? 'Cours terminé ✓' : pending ? 'Enregistrement…' : 'J’ai terminé ce cours'}
    </button>
  )
}

/**
 * Deux choses distinctes, et c'est volontaire :
 *
 * - l'ouverture s'enregistre toute seule, en silence — un élève n'a pas à
 *   déclarer qu'il a commencé à lire ;
 * - la fin se déclare explicitement. Déduire « terminé » d'un défilement
 *   jusqu'en bas donnerait des faux positifs (on fait défiler pour voir la
 *   longueur) et priverait l'élève du sentiment d'avoir bouclé quelque chose.
 */
export function MarqueurDeLecture({
  leconId,
  apprenantId,
  dernierBloc,
}: {
  leconId: string
  apprenantId: IdentifiantApprenant
  dernierBloc: number
}) {
  const [etat, action] = useActionState<EtatLecture, FormData>(marquerLecture, {
    enregistre: false,
  })
  const ouvertureEnvoyee = useRef(false)

  useEffect(() => {
    if (ouvertureEnvoyee.current) return
    ouvertureEnvoyee.current = true

    const donnees = new FormData()
    donnees.set('leconId', leconId)
    donnees.set('position', '0')
    donnees.set('terminee', 'false')
    void marquerLecture({ enregistre: false }, donnees)
  }, [leconId, apprenantId])

  return (
    <form action={action} className="flex flex-col gap-3 border-t border-bordure pt-8">
      <input type="hidden" name="leconId" value={leconId} />
      <input type="hidden" name="position" value={dernierBloc} />
      <input type="hidden" name="terminee" value="true" />
      <BoutonTerminer dejaFait={etat.enregistre} />
    </form>
  )
}
