'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { lireContenu, type CompetenceOption, type ContenuBloc } from '@/domaines/catalogue'
import { RenduBloc } from '../../../_composants/rendu-bloc'
import { enregistrer, publier, type EtatEdition } from '../actions'

/**
 * Éditeur de leçon.
 *
 * Deux partis pris tirés du document 05 :
 *
 * - **l'aperçu élève est permanent**, en colonne. Pas un bouton
 *   « prévisualiser » qui change de page — un enseignant qui doit naviguer pour
 *   voir son rendu cesse de vérifier ;
 * - **aucun champ n'est obligatoire hors titre et compétences.** Tout le reste
 *   se remplit dans l'ordre qu'on veut.
 */

type BlocEdite =
  | { readonly cle: string; readonly type: 'texte'; readonly texte: string }
  | {
      readonly cle: string
      readonly type: 'lien'
      readonly url: string
      readonly titre: string
      readonly description: string
    }
  /**
   * Les types que cet éditeur ne sait pas encore modifier (image, vidéo, 3D…)
   * sont transportés tels quels. Les laisser de côté reviendrait à les
   * SUPPRIMER au premier enregistrement, puisque celui-ci remplace la totalité
   * des blocs — un enseignant perdrait ses images sans comprendre pourquoi.
   */
  | { readonly cle: string; readonly type: 'opaque'; readonly contenu: ContenuBloc }

const LIBELLE_BLOC: Record<BlocEdite['type'], string> = {
  texte: 'Texte',
  lien: 'Lien',
  // « Contenu média » serait inexact : ce sont aussi des bibliographies.
  opaque: 'Contenu non modifiable ici',
}

let compteur = 0
const nouvelleCle = () => `bloc-${++compteur}`

function versContenu(bloc: BlocEdite): ContenuBloc | null {
  if (bloc.type === 'opaque') return bloc.contenu

  const brut =
    bloc.type === 'texte'
      ? { type: 'texte', texte: bloc.texte }
      : {
          type: 'lien',
          url: bloc.url,
          titre: bloc.titre,
          ...(bloc.description ? { description: bloc.description } : {}),
        }

  // Le même validateur que le serveur : ce que l'aperçu montre est exactement
  // ce qui sera accepté. Un aperçu plus permissif que l'enregistrement serait
  // un piège.
  return lireContenu(brut)
}

function Boutons({ statut }: { statut: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-carte border border-bordure px-4 py-2 text-sm disabled:opacity-60"
    >
      {pending ? '…' : statut}
    </button>
  )
}

export function Editeur({
  leconId,
  titreInitial,
  statut,
  competencesChoisies,
  competences,
  blocsInitiaux,
}: {
  leconId: string
  titreInitial: string
  statut: string
  competencesChoisies: readonly string[]
  competences: readonly CompetenceOption[]
  blocsInitiaux: readonly ContenuBloc[]
}) {
  const [titre, setTitre] = useState(titreInitial)
  const [choisies, setChoisies] = useState<readonly string[]>(competencesChoisies)
  const [blocs, setBlocs] = useState<readonly BlocEdite[]>(() =>
    blocsInitiaux.flatMap((contenu): BlocEdite[] => {
      if (contenu.type === 'texte') {
        return [{ cle: nouvelleCle(), type: 'texte', texte: contenu.texte }]
      }
      if (contenu.type === 'lien') {
        return [
          {
            cle: nouvelleCle(),
            type: 'lien',
            url: contenu.url,
            titre: contenu.titre,
            description: contenu.description ?? '',
          },
        ]
      }
      return [{ cle: nouvelleCle(), type: 'opaque', contenu }]
    }),
  )

  const [etatEnr, actionEnr] = useActionState<EtatEdition, FormData>(enregistrer, {})
  const [etatPub, actionPub] = useActionState<EtatEdition, FormData>(publier, {})

  const contenus = blocs.map(versContenu)
  const valides = contenus.filter((c): c is ContenuBloc => c !== null)

  const modifier = (cle: string, champs: Partial<BlocEdite>) =>
    setBlocs((actuels) =>
      actuels.map((b) => (b.cle === cle ? ({ ...b, ...champs } as BlocEdite) : b)),
    )

  const deplacer = (index: number, delta: number) =>
    setBlocs((actuels) => {
      const cible = index + delta
      if (cible < 0 || cible >= actuels.length) return actuels
      const copie = [...actuels]
      const [retire] = copie.splice(index, 1)
      copie.splice(cible, 0, retire!)
      return copie
    })

  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {/* --- Édition ------------------------------------------------------ */}
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="titre" className="text-sm font-medium">
            Titre
          </label>
          <input
            id="titre"
            value={titre}
            onChange={(e) => setTitre(e.target.value)}
            className="rounded-carte border border-bordure bg-surface px-4 py-3 text-base"
          />
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">Compétences travaillées</legend>
          <ul className="flex flex-col gap-1">
            {competences.map((competence) => (
              <li key={competence.id}>
                <label className="flex items-start gap-3 text-sm">
                  <input
                    type="checkbox"
                    checked={choisies.includes(competence.id)}
                    onChange={(e) =>
                      setChoisies((actuelles) =>
                        e.target.checked
                          ? [...actuelles, competence.id]
                          : actuelles.filter((c) => c !== competence.id),
                      )
                    }
                    className="mt-1"
                  />
                  <span>
                    <span className="font-medium">{competence.code}</span>{' '}
                    <span className="text-mine-doux">{competence.intitule}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {choisies.length === 0 ? (
            <p className="text-sm text-alerte">
              Sans compétence, cette leçon ne comptera dans la progression
              d’aucun élève.
            </p>
          ) : null}
        </fieldset>

        <section className="flex flex-col gap-4">
          <h2 className="text-sm font-medium">Contenu</h2>

          {blocs.map((bloc, index) => (
            <div
              key={bloc.cle}
              className="flex flex-col gap-2 rounded-carte border border-bordure p-3"
            >
              <div className="flex items-center justify-between gap-2 text-sm text-mine-doux">
                <span>{LIBELLE_BLOC[bloc.type]}</span>
                <span className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => deplacer(index, -1)}
                    disabled={index === 0}
                    aria-label="Monter ce bloc"
                    className="disabled:opacity-30"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    onClick={() => deplacer(index, 1)}
                    disabled={index === blocs.length - 1}
                    aria-label="Descendre ce bloc"
                    className="disabled:opacity-30"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setBlocs((actuels) => actuels.filter((b) => b.cle !== bloc.cle))
                    }
                    aria-label="Supprimer ce bloc"
                    className="text-alerte"
                  >
                    ✕
                  </button>
                </span>
              </div>

              {bloc.type === 'opaque' ? (
                <p className="text-sm text-mine-doux">
                  Ce contenu n’est pas encore modifiable ici. Il est conservé tel
                  quel et reste visible par les élèves.
                </p>
              ) : bloc.type === 'texte' ? (
                <textarea
                  value={bloc.texte}
                  onChange={(e) => modifier(bloc.cle, { texte: e.target.value })}
                  rows={6}
                  placeholder="Une ligne vide sépare deux paragraphes."
                  className="rounded-carte border border-bordure bg-surface px-3 py-2 text-sm"
                />
              ) : (
                <div className="flex flex-col gap-2">
                  <input
                    value={bloc.titre}
                    onChange={(e) => modifier(bloc.cle, { titre: e.target.value })}
                    placeholder="Titre du lien"
                    className="rounded-carte border border-bordure bg-surface px-3 py-2 text-sm"
                  />
                  <input
                    value={bloc.url}
                    onChange={(e) => modifier(bloc.cle, { url: e.target.value })}
                    placeholder="https://…"
                    className="rounded-carte border border-bordure bg-surface px-3 py-2 text-sm"
                  />
                  {bloc.url !== '' && contenus[index] === null ? (
                    <p className="text-sm text-alerte">
                      Adresse invalide. Seuls les liens http et https sont acceptés.
                    </p>
                  ) : null}
                </div>
              )}
            </div>
          ))}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() =>
                setBlocs((a) => [...a, { cle: nouvelleCle(), type: 'texte', texte: '' }])
              }
              className="rounded-carte border border-bordure px-4 py-2 text-sm"
            >
              + Texte
            </button>
            <button
              type="button"
              onClick={() =>
                setBlocs((a) => [
                  ...a,
                  { cle: nouvelleCle(), type: 'lien', url: '', titre: '', description: '' },
                ])
              }
              className="rounded-carte border border-bordure px-4 py-2 text-sm"
            >
              + Lien
            </button>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-3 border-t border-bordure pt-4">
          <form action={actionEnr}>
            <input type="hidden" name="leconId" value={leconId} />
            <input type="hidden" name="titre" value={titre} />
            <input type="hidden" name="blocs" value={JSON.stringify(valides)} />
            {choisies.map((c) => (
              <input key={c} type="hidden" name="competences" value={c} />
            ))}
            <Boutons statut="Enregistrer" />
          </form>

          <form action={actionPub}>
            <input type="hidden" name="leconId" value={leconId} />
            <button
              type="submit"
              className="rounded-carte bg-accent px-5 py-2 text-sm font-medium text-accent-contraste"
            >
              {statut === 'publiee' ? 'Republier' : 'Publier'}
            </button>
          </form>
        </div>

        {[etatEnr, etatPub].map((etat, i) =>
          etat.erreur || etat.message ? (
            <p
              key={i}
              role="alert"
              className={`rounded-carte border px-4 py-3 text-sm ${
                etat.erreur
                  ? 'border-alerte/30 bg-alerte-douce text-alerte'
                  : 'border-accent/30 bg-accent-doux'
              }`}
            >
              {etat.erreur ?? etat.message}
              {etat.alertes?.map((alerte) => (
                <span key={alerte} className="mt-1 block text-mine-doux">
                  {alerte}
                </span>
              ))}
            </p>
          ) : null,
        )}
      </div>

      {/* --- Aperçu élève, permanent -------------------------------------- */}
      <div className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <h2 className="text-sm font-medium text-mine-doux">Ce que voit l’élève</h2>
        <div className="flex flex-col gap-6 rounded-carte border border-bordure p-5">
          <h3 className="text-xl font-semibold">{titre || 'Sans titre'}</h3>
          {valides.length === 0 ? (
            <p className="text-mine-doux">
              Ajoute un contenu : il apparaîtra ici tel que l’élève le verra.
            </p>
          ) : (
            valides.map((contenu, i) => <RenduBloc key={i} contenu={contenu} />)
          )}
        </div>
      </div>
    </div>
  )
}
