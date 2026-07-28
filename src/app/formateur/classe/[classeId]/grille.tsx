'use client'

import { useActionState, useState } from 'react'
import {
  cle,
  type ColonneCompetence,
  type LigneApprenant,
} from '@/domaines/progression'
import { declarerAcquis, type EtatDeclaration } from './actions'

/**
 * La grille élèves × compétences.
 *
 * Quatre niveaux, quatre symboles, et jamais la couleur seule : environ 8 % des
 * garçons sont daltoniens, et l'agroéquipement est une filière très masculine.
 * Un code exclusivement chromatique y serait illisible pour deux élèves par
 * classe — et pour l'enseignant lui-même.
 */

type Niveau = 'non_abordee' | 'en_cours' | 'acquise' | 'maitrisee'

const APPARENCE: Record<Niveau, { symbole: string; libelle: string; classe: string }> = {
  non_abordee: { symbole: '·', libelle: 'Non abordée', classe: 'text-mine-doux' },
  en_cours: { symbole: '◐', libelle: 'En cours', classe: 'text-mine' },
  acquise: { symbole: '●', libelle: 'Acquise', classe: 'text-accent' },
  maitrisee: { symbole: '★', libelle: 'Maîtrisée', classe: 'text-accent' },
}

const NIVEAUX = Object.keys(APPARENCE) as Niveau[]

export function Grille({
  classeId,
  apprenants,
  competences,
  niveaux,
}: {
  classeId: string
  apprenants: readonly LigneApprenant[]
  competences: readonly ColonneCompetence[]
  /** Aplatie côté serveur : une Map ne traverse pas la frontière client. */
  niveaux: Readonly<Record<string, Niveau>>
}) {
  const [selection, setSelection] = useState<{
    apprenant: LigneApprenant
    competence: ColonneCompetence
    niveau: Niveau
  } | null>(null)

  const [etat, action] = useActionState<EtatDeclaration, FormData>(declarerAcquis, {})

  if (apprenants.length === 0) {
    return (
      <p className="rounded-carte border border-bordure px-4 py-8 text-center text-mine-doux">
        Aucun élève inscrit dans cette classe.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* La grille déborde horizontalement dès une dizaine de compétences :
          elle défile dans son propre cadre, jamais la page entière. */}
      <div className="overflow-x-auto rounded-carte border border-bordure">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Acquisition des compétences, par élève
          </caption>
          <thead>
            <tr>
              <th scope="col" className="sticky left-0 z-10 bg-surface px-4 py-3 text-left">
                Élève
              </th>
              {competences.map((competence) => (
                <th
                  key={competence.id}
                  scope="col"
                  className="px-3 py-3 text-center font-medium"
                  title={competence.intitule}
                >
                  {competence.code}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {apprenants.map((apprenant) => (
              <tr key={apprenant.id} className="border-t border-bordure">
                <th
                  scope="row"
                  className="sticky left-0 z-10 whitespace-nowrap bg-surface px-4 py-2 text-left font-normal"
                >
                  {apprenant.prenom} {apprenant.initialeNom}.
                </th>
                {competences.map((competence) => {
                  const niveau = niveaux[cle(apprenant.id, competence.id)] ?? 'non_abordee'
                  const apparence = APPARENCE[niveau]

                  return (
                    <td key={competence.id} className="px-3 py-2 text-center">
                      <button
                        type="button"
                        onClick={() => setSelection({ apprenant, competence, niveau })}
                        className={`h-8 w-8 rounded text-lg ${apparence.classe} hover:bg-surface-2`}
                        // Le symbole seul ne dit rien à un lecteur d'écran.
                        aria-label={`${apprenant.prenom}, ${competence.code} : ${apparence.libelle}. Modifier.`}
                      >
                        {apparence.symbole}
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="flex flex-wrap gap-4 text-sm text-mine-doux">
        {NIVEAUX.map((niveau) => (
          <li key={niveau} className="flex items-center gap-2">
            <span className={APPARENCE[niveau].classe}>{APPARENCE[niveau].symbole}</span>
            {APPARENCE[niveau].libelle}
          </li>
        ))}
      </ul>

      {selection ? (
        <form
          action={action}
          className="flex flex-col gap-3 rounded-carte border border-bordure p-4"
        >
          <input type="hidden" name="classeId" value={classeId} />
          <input type="hidden" name="apprenantId" value={selection.apprenant.id} />
          <input type="hidden" name="competenceId" value={selection.competence.id} />

          <p className="font-medium">
            {selection.apprenant.prenom} {selection.apprenant.initialeNom}. —{' '}
            {selection.competence.code}
          </p>
          <p className="text-sm text-mine-doux">{selection.competence.intitule}</p>

          <div className="flex flex-wrap gap-2">
            {NIVEAUX.map((niveau) => (
              <button
                key={niveau}
                type="submit"
                name="niveau"
                value={niveau}
                className={`rounded-carte border px-4 py-2 text-sm ${
                  niveau === selection.niveau
                    ? 'border-accent bg-accent-doux'
                    : 'border-bordure'
                }`}
              >
                {APPARENCE[niveau].libelle}
              </button>
            ))}
          </div>

          <p className="text-sm text-mine-doux">
            Ta déclaration prime sur les résultats d’évaluation, y compris pour
            faire redescendre un niveau.
          </p>

          {etat.message || etat.erreur ? (
            <p role="status" className={`text-sm ${etat.erreur ? 'text-alerte' : 'text-mine-doux'}`}>
              {etat.erreur ?? etat.message}
            </p>
          ) : null}

          <button
            type="button"
            onClick={() => setSelection(null)}
            className="w-fit text-sm underline"
          >
            Fermer
          </button>
        </form>
      ) : null}
    </div>
  )
}
