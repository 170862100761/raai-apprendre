'use client'

import { useActionState, useState } from 'react'
import { effacerEleve, exporterEleve, type EtatRgpd } from './actions'

const INITIAL: EtatRgpd = {}

export type EleveListe = {
  readonly id: string
  readonly prenom: string
  readonly initialeNom: string
  readonly identifiant: string | null
  readonly actif: boolean
  readonly classes: readonly string[]
}

export function DemandesRgpd({ eleves }: { eleves: readonly EleveListe[] }) {
  const [choisi, setChoisi] = useState<string>('')
  const eleve = eleves.find((e) => e.id === choisi)

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <label htmlFor="eleve" className="text-sm font-medium">
          Élève concerné par la demande
        </label>
        <select
          id="eleve"
          value={choisi}
          onChange={(e) => setChoisi(e.target.value)}
          className="rounded-carte border px-3 py-2"
        >
          <option value="">— Choisir —</option>
          {eleves.map((e) => (
            <option key={e.id} value={e.id}>
              {e.prenom} {e.initialeNom}
              {e.classes.length > 0 ? ` · ${e.classes.join(', ')}` : ''}
              {e.actif ? '' : ' · déjà effacé'}
            </option>
          ))}
        </select>
      </div>

      {eleve && eleve.actif && <Actions eleve={eleve} />}

      {eleve && !eleve.actif && (
        <p className="rounded-carte border border-bordure px-4 py-3 text-sm text-mine-doux">
          Cet élève a déjà été effacé. Il n’y a plus rien à exporter le
          concernant, et l’opération ne peut pas être répétée.
        </p>
      )}
    </section>
  )
}

function Actions({ eleve }: { eleve: EleveListe }) {
  const [etatExport, actionExport, exportEnCours] = useActionState(exporterEleve, INITIAL)
  const [etatEffacement, actionEffacement, effacementEnCours] = useActionState(
    effacerEleve,
    INITIAL,
  )

  return (
    <div className="flex flex-col gap-6">
      <form action={actionExport} className="flex flex-col gap-3">
        <input type="hidden" name="apprenantId" value={eleve.id} />
        <h2 className="font-medium">Remettre son dossier</h2>
        <p className="text-sm text-mine-doux">
          Un fichier JSON contenant ses acquis, ses évaluations et ses lectures.
          Le fichier est engendré dans ce navigateur : il ne repasse pas par le
          serveur.
        </p>
        <button
          type="submit"
          disabled={exportEnCours}
          className="self-start rounded-carte border border-bordure px-4 py-2 disabled:opacity-60"
        >
          {exportEnCours ? 'Préparation…' : 'Préparer le dossier'}
        </button>

        {etatExport.erreur && (
          <p role="alert" className="text-sm text-alerte">
            {etatExport.erreur}
          </p>
        )}
        {etatExport.dossier && etatExport.nomFichier && (
          <Telechargement contenu={etatExport.dossier} nom={etatExport.nomFichier} />
        )}
      </form>

      <form
        action={actionEffacement}
        className="flex flex-col gap-3 rounded-carte border border-alerte/40 bg-alerte-douce px-4 py-4"
      >
        <input type="hidden" name="apprenantId" value={eleve.id} />
        <input type="hidden" name="identifiantAttendu" value={eleve.identifiant ?? ''} />

        <h2 className="font-medium text-alerte">Honorer une demande d’effacement</h2>
        <p className="text-sm">
          Irréversible. Pour confirmer, retape l’identifiant de connexion de
          l’élève :{' '}
          <code className="bg-surface-2 px-1">{eleve.identifiant ?? '—'}</code>
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="confirmation" className="text-sm">
              Identifiant de l’élève
            </label>
            <input
              id="confirmation"
              name="confirmation"
              type="text"
              autoComplete="off"
              className="rounded-carte border px-3 py-2"
            />
          </div>
          <button
            type="submit"
            disabled={effacementEnCours}
            className="rounded-carte bg-alerte px-4 py-2 font-medium text-surface disabled:opacity-60"
          >
            {effacementEnCours ? 'Effacement…' : 'Effacer définitivement'}
          </button>
        </div>

        {etatEffacement.erreur && (
          <p role="alert" className="text-sm text-alerte">
            {etatEffacement.erreur}
          </p>
        )}
        {etatEffacement.message && (
          <p role="status" className="text-sm">
            {etatEffacement.message}
          </p>
        )}
      </form>
    </div>
  )
}

/**
 * Le téléchargement, engendré dans le navigateur.
 *
 * Même règle que les codes d'accès à la mise en route : un dossier RGPD
 * complet qui repasserait par un service de fichiers laisserait une copie de
 * données personnelles dans un endroit où personne ne pense à aller la
 * chercher — journaux de serveur, cache d'un intermédiaire, sauvegarde.
 */
function Telechargement({ contenu, nom }: { contenu: string; nom: string }) {
  const [url] = useState(() =>
    URL.createObjectURL(new Blob([contenu], { type: 'application/json' })),
  )

  return (
    <a
      href={url}
      download={nom}
      className="self-start rounded-carte bg-accent px-4 py-2 font-medium text-accent-contraste"
    >
      Télécharger {nom}
    </a>
  )
}
