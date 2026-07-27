import type { ContenuBloc } from '@/domaines/catalogue'

/**
 * Rendu d'un bloc de leçon.
 *
 * Aucun `dangerouslySetInnerHTML`, nulle part : c'est ce qui garantit qu'un
 * contenu d'enseignant — ou un contenu importé, ou généré — ne peut pas
 * exécuter de script chez un élève. Le prix à payer est ce fichier ; il est
 * dérisoire comparé à la garantie.
 *
 * Chaque type de bloc a ici son rendu, et l'ensemble reste exhaustif :
 * TypeScript refuse de compiler si un type de bloc n'est pas traité.
 */
export function RenduBloc({ contenu }: { contenu: ContenuBloc }) {
  switch (contenu.type) {
    case 'texte':
      return (
        <div className="flex flex-col gap-4 leading-relaxed">
          {/* Les sauts de ligne font les paragraphes. Pas de markdown, pas de
              balises : le texte reste du texte. */}
          {contenu.texte
            .split(/\n{2,}/)
            .filter((p) => p.trim() !== '')
            .map((paragraphe, i) => (
              <p key={i}>{paragraphe}</p>
            ))}
        </div>
      )

    case 'image':
    case 'schema':
      return (
        <figure className="flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/v1/medias/${contenu.ressourceId}`}
            alt={contenu.alternative}
            className="w-full rounded-carte border border-bordure"
            loading="lazy"
          />
          {contenu.legende ? (
            <figcaption className="text-sm text-mine-doux">{contenu.legende}</figcaption>
          ) : null}
        </figure>
      )

    case 'video':
      return (
        <figure className="flex flex-col gap-2">
          <video
            controls
            preload="none"
            className="w-full rounded-carte border border-bordure"
            src={`/api/v1/medias/${contenu.ressourceId}`}
          >
            {contenu.sousTitresRessourceId ? (
              <track
                kind="captions"
                srcLang="fr"
                label="Français"
                default
                src={`/api/v1/medias/${contenu.sousTitresRessourceId}`}
              />
            ) : null}
          </video>
          <figcaption className="text-sm text-mine-doux">{contenu.titre}</figcaption>
        </figure>
      )

    case 'modele3d':
      return (
        <figure className="flex flex-col gap-3 rounded-carte border border-bordure p-4">
          <figcaption className="font-medium">{contenu.titre}</figcaption>
          {/* La description n'est pas un repli : elle est toujours affichée.
              Une partie du parc des établissements n'a pas de WebGL, et un
              modèle qu'on ne peut pas voir doit rester compréhensible. */}
          <p className="text-sm text-mine-doux">{contenu.description}</p>
          <p className="text-sm text-mine-doux">
            Modèle {contenu.format.toUpperCase()} — la visionneuse 3D n’est pas
            encore branchée.
          </p>
        </figure>
      )

    case 'pdf':
      return (
        <a
          href={`/api/v1/medias/${contenu.ressourceId}`}
          className="flex items-center justify-between gap-4 rounded-carte border border-bordure px-4 py-3 hover:bg-surface-2"
        >
          <span className="font-medium">{contenu.titre}</span>
          <span className="text-sm text-mine-doux">
            PDF{contenu.pages ? ` · ${contenu.pages} p.` : ''}
          </span>
        </a>
      )

    case 'lien':
      return (
        <a
          href={contenu.url}
          target="_blank"
          /* `noreferrer` autant que `noopener` : on n'envoie pas l'URL de la
             leçon d'un élève à un site tiers. */
          rel="noopener noreferrer"
          className="flex flex-col gap-1 rounded-carte border border-bordure px-4 py-3 hover:bg-surface-2"
        >
          <span className="font-medium">{contenu.titre}</span>
          {contenu.description ? (
            <span className="text-sm text-mine-doux">{contenu.description}</span>
          ) : null}
          <span className="text-sm text-mine-doux">{new URL(contenu.url).hostname}</span>
        </a>
      )

    case 'bibliographie':
      return (
        <section className="flex flex-col gap-2 rounded-carte border border-bordure p-4">
          <h3 className="text-sm font-medium text-mine-doux">Pour aller plus loin</h3>
          <ul className="flex flex-col gap-2">
            {contenu.references.map((reference, i) => (
              <li key={i} className="text-sm">
                {reference.url ? (
                  <a href={reference.url} target="_blank" rel="noopener noreferrer" className="underline">
                    {reference.titre}
                  </a>
                ) : (
                  reference.titre
                )}
                {reference.auteur ? `, ${reference.auteur}` : ''}
                {reference.annee ? ` (${reference.annee})` : ''}
              </li>
            ))}
          </ul>
        </section>
      )

    case 'fichier':
      return (
        <a
          href={`/api/v1/medias/${contenu.ressourceId}`}
          download
          className="flex flex-col gap-1 rounded-carte border border-bordure px-4 py-3 hover:bg-surface-2"
        >
          <span className="font-medium">{contenu.nom}</span>
          {contenu.description ? (
            <span className="text-sm text-mine-doux">{contenu.description}</span>
          ) : null}
        </a>
      )
  }
}
