'use client'

import { useState, useTransition } from 'react'
import { envoyerFichier, type EtatTeleversement } from '../televerser'

/**
 * Dépôt d'une image ou d'un schéma.
 *
 * L'alternative textuelle est un champ de premier plan, pas une option cachée :
 * sans elle, le schéma est invisible pour un élève qui utilise un lecteur
 * d'écran, et muet dans un export PDF. Le domaine la rend obligatoire ; ici on
 * explique pourquoi, au lieu de se contenter d'un astérisque.
 */
export function ChampImage({
  ressourceId,
  alternative,
  legende,
  onChange,
}: {
  ressourceId: string
  alternative: string
  legende: string
  onChange: (champs: { ressourceId?: string; alternative?: string; legende?: string }) => void
}) {
  const [enCours, demarrer] = useTransition()
  const [erreur, setErreur] = useState<string | null>(null)

  const envoyer = (fichier: File) => {
    setErreur(null)
    demarrer(async () => {
      const donnees = new FormData()
      donnees.set('fichier', fichier)

      const etat: EtatTeleversement = await envoyerFichier({}, donnees)
      if (etat.erreur) {
        setErreur(etat.erreur)
        return
      }
      if (etat.ressourceId) {
        onChange({
          ressourceId: etat.ressourceId,
          // Le nom du fichier fait un premier jet d'alternative — mieux que
          // rien, et à corriger. « schema-hydraulique.png » est déjà plus
          // parlant qu'un champ vide qu'on laissera vide.
          ...(alternative ? {} : { alternative: etat.nom?.replace(/\.[^.]+$/, '') ?? '' }),
        })
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      {ressourceId ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/v1/medias/${ressourceId}`}
          alt={alternative || 'Aperçu'}
          className="max-h-48 w-fit rounded-carte border border-bordure"
        />
      ) : null}

      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        disabled={enCours}
        onChange={(e) => {
          const fichier = e.target.files?.[0]
          if (fichier) envoyer(fichier)
        }}
        className="text-sm"
      />
      {enCours ? <p className="text-sm text-mine-doux">Envoi en cours…</p> : null}
      {erreur ? (
        <p role="alert" className="text-sm text-alerte">
          {erreur}
        </p>
      ) : null}

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Description de l’image</span>
        <span className="text-mine-doux">
          Ce que l’image montre, en une phrase. Lu à voix haute par les lecteurs
          d’écran, et affiché si l’image ne charge pas.
        </span>
        <input
          value={alternative}
          onChange={(e) => onChange({ alternative: e.target.value })}
          className="rounded-carte border border-bordure bg-surface px-3 py-2"
        />
      </label>

      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Légende (facultative)</span>
        <input
          value={legende}
          onChange={(e) => onChange({ legende: e.target.value })}
          className="rounded-carte border border-bordure bg-surface px-3 py-2"
        />
      </label>

      {ressourceId && !alternative ? (
        <p className="text-sm text-alerte">
          Sans description, cette image ne sera pas enregistrée.
        </p>
      ) : null}
    </div>
  )
}
