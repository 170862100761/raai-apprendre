'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Visionneuse 3D.
 *
 * Trois contraintes, toutes tirées du parc réel des établissements :
 *
 * 1. **Elle ne pèse rien tant qu'on ne l'ouvre pas.** Three.js fait plus de
 *    150 ko : une leçon sans modèle 3D ne doit pas les payer. D'où le chargement
 *    dynamique de la bibliothèque elle-même, au clic, et non à l'import du
 *    module.
 * 2. **Elle se replie proprement.** Une partie des postes n'a pas de WebGL
 *    utilisable. La description reste alors la seule chose que l'élève voit, et
 *    c'est pour cela qu'elle est obligatoire dans le modèle.
 * 3. **Elle se pilote au clavier.** Les salles informatiques ont des souris
 *    capricieuses, et une partie des élèves navigue au clavier.
 *
 * Le STEP n'est PAS lu ici : sa tessellation appartient à un travail serveur
 * (doc 02 §5). Charger OpenCascade dans le navigateur d'un Chromebook de MFR
 * reviendrait à promettre ce qu'on ne peut pas tenir. Le serveur en produit un
 * GLB allégé au dépôt du fichier, et c'est ce GLB que la visionneuse affiche —
 * le STEP, lui, reste téléchargeable tel quel.
 */

export type Format = 'glb' | 'stl' | 'step'

type Etat = 'repos' | 'chargement' | 'pret' | 'echec' | 'sans-webgl'

/**
 * Existence de l'aperçu converti, pour le seul cas du STEP.
 *
 * `inconnu` le temps de la question au serveur : afficher le bouton d'emblée
 * puis le retirer ferait sauter la mise en page sous le doigt de l'élève.
 */
type Apercu = 'inconnu' | 'disponible' | 'absent'

/** Détection réelle, pas une supposition sur le navigateur. */
function webglDisponible(): boolean {
  try {
    const toile = document.createElement('canvas')
    return Boolean(
      toile.getContext('webgl2') ??
        toile.getContext('webgl') ??
        toile.getContext('experimental-webgl'),
    )
  } catch {
    return false
  }
}

export function Visionneuse3d({
  ressourceId,
  titre,
  description,
  format,
}: {
  ressourceId: string
  titre: string
  description: string
  format: Format
}) {
  const [etat, setEtat] = useState<Etat>('repos')
  const [apercu, setApercu] = useState<Apercu>(format === 'step' ? 'inconnu' : 'absent')
  const conteneur = useRef<HTMLDivElement>(null)
  const nettoyer = useRef<(() => void) | null>(null)

  useEffect(() => () => nettoyer.current?.(), [])

  // Le STEP ne s'affiche que si le serveur a réussi sa tessellation. On le
  // demande — `HEAD`, donc sans télécharger le modèle — plutôt que de proposer
  // un bouton qui échouerait. Une conversion peut aussi être encore en cours :
  // pour l'élève, c'est la même chose qu'un aperçu absent.
  useEffect(() => {
    if (format !== 'step') return

    const abandon = new AbortController()

    fetch(`/api/v1/medias/${ressourceId}/apercu-3d`, {
      method: 'HEAD',
      signal: abandon.signal,
    })
      .then((reponse) => setApercu(reponse.ok ? 'disponible' : 'absent'))
      // Réseau coupé : on ne promet rien. Le lien de téléchargement reste.
      .catch(() => {
        if (!abandon.signal.aborted) setApercu('absent')
      })

    return () => abandon.abort()
  }, [format, ressourceId])

  const ouvrir = async () => {
    if (!webglDisponible()) {
      setEtat('sans-webgl')
      return
    }

    const cible = conteneur.current
    if (!cible) {
      setEtat('echec')
      return
    }

    setEtat('chargement')
    try {
      const { afficherModele } = await import('./moteur-3d')
      nettoyer.current = await afficherModele({
        conteneur: cible,
        // Le STEP passe par son aperçu converti ; les deux autres formats sont
        // servis tels quels.
        url:
          format === 'step'
            ? `/api/v1/medias/${ressourceId}/apercu-3d`
            : `/api/v1/medias/${ressourceId}`,
        format: format === 'stl' ? 'stl' : 'glb',
      })
      setEtat('pret')
    } catch (erreur) {
      // Ne pas étouffer : un `catch` muet cache la cause à qui débogue, et
      // c'est exactement ce qui fait perdre une demi-heure.
      console.error('[visionneuse-3d]', erreur)
      setEtat('echec')
    }
  }

  const affichable =
    format === 'glb' || format === 'stl' || (format === 'step' && apercu === 'disponible')

  return (
    <figure className="flex flex-col gap-3 rounded-carte border border-bordure p-4">
      <figcaption className="font-medium">{titre}</figcaption>

      {/* Toujours affichée, jamais un simple repli : c'est ce que lira un
          lecteur d'écran, et ce que verra un poste sans WebGL. */}
      <p className="text-sm text-mine-doux">{description}</p>

      {/* Toujours monté : le rendre conditionnellement laisserait la référence
          nulle au moment du clic, puisque React n'a pas encore validé le rendu.
          On le masque, on ne le démonte pas. */}
      <div
        ref={conteneur}
        role="img"
        aria-label={`Modèle 3D : ${description}`}
        tabIndex={etat === 'pret' ? 0 : -1}
        aria-hidden={etat === 'pret' ? undefined : true}
        className={
          etat === 'pret' || etat === 'chargement'
            ? 'h-80 w-full overflow-hidden rounded-carte border border-bordure bg-surface-2'
            : 'hidden'
        }
      />

      {etat === 'repos' && affichable ? (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={ouvrir}
            className="w-fit rounded-carte border border-bordure px-4 py-2 text-sm"
          >
            Afficher le modèle en 3D
          </button>
          <span className="text-sm text-mine-doux">
            Charge un affichage 3D — évite en connexion limitée.
          </span>
        </div>
      ) : null}

      {etat === 'chargement' ? (
        <p className="text-sm text-mine-doux">Chargement du modèle…</p>
      ) : null}

      {etat === 'pret' ? (
        <p className="text-sm text-mine-doux">
          Faire glisser pour tourner, molette pour zoomer. Au clavier : flèches
          pour tourner, <kbd>+</kbd> et <kbd>−</kbd> pour zoomer.
        </p>
      ) : null}

      {etat === 'sans-webgl' ? (
        <p role="alert" className="text-sm text-alerte">
          Cet ordinateur n’affiche pas la 3D. Tu peux télécharger le fichier
          ci-dessous et l’ouvrir dans ton logiciel de CAO.
        </p>
      ) : null}

      {etat === 'echec' ? (
        <p role="alert" className="text-sm text-alerte">
          Le modèle n’a pas pu être affiché. Tu peux le télécharger.
        </p>
      ) : null}

      {/* Rien tant que la réponse du serveur n'est pas là : annoncer « pas
          d'aperçu » pour se corriger un instant plus tard ferait sauter la mise
          en page sous le doigt de l'élève. */}
      {format === 'step' && apercu === 'absent' ? (
        <p className="text-sm text-mine-doux">
          Ce modèle n’a pas d’aperçu affichable. Tu peux télécharger le fichier
          STEP et l’ouvrir dans un logiciel de CAO.
        </p>
      ) : null}


      <a
        href={`/api/v1/medias/${ressourceId}`}
        download
        className="w-fit text-sm underline"
      >
        Télécharger le fichier {format.toUpperCase()}
      </a>
    </figure>
  )
}
