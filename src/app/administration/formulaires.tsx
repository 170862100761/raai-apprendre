'use client'

import { useActionState, useState } from 'react'
import { useFormStatus } from 'react-dom'
import Link from 'next/link'
import type { AnneeDisponible, OffreDisponible } from '@/domaines/organisation'
import { creer, importer, type EtatClasse, type EtatImport } from './actions'
import { RemiseAcces } from './remise-acces'

function Bouton({ libelle }: { libelle: string }) {
  const { pending } = useFormStatus()
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-fit rounded-carte bg-accent px-5 py-3 font-medium text-accent-contraste
                 transition-opacity hover:opacity-90 disabled:opacity-60"
    >
      {pending ? '…' : libelle}
    </button>
  )
}

export function MiseEnRoute({
  offres,
  annees,
}: {
  offres: readonly OffreDisponible[]
  annees: readonly AnneeDisponible[]
}) {
  const [offreChoisie, setOffreChoisie] = useState(offres[0]?.id ?? '')
  const [etatClasse, actionClasse] = useActionState<EtatClasse, FormData>(creer, {})
  const [etatImport, actionImport] = useActionState<EtatImport, FormData>(importer, {})

  const niveaux = offres.find((o) => o.id === offreChoisie)?.niveaux ?? []
  const annee = annees.find((a) => a.id !== undefined)

  if (offres.length === 0 || annees.length === 0) {
    return (
      <p className="rounded-carte border border-alerte/30 bg-alerte-douce px-4 py-4 text-sm">
        Cet établissement n’a ni formation ouverte ni année scolaire. Ces deux
        éléments viennent du catalogue national et doivent être mis en place
        avant de créer une classe.
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-10">
      {/* --- 1. La classe --------------------------------------------------- */}
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">1. Créer une classe</h2>

        <form action={actionClasse} className="flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">Nom de la classe</span>
            <input
              name="nom"
              placeholder="TAE 2026"
              required
              className="rounded-carte border border-bordure bg-surface px-4 py-3"
            />
            {etatClasse.champs?.nom ? (
              <span className="text-sm text-alerte">{etatClasse.champs.nom}</span>
            ) : null}
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">Formation</span>
            <select
              name="offreId"
              value={offreChoisie}
              onChange={(e) => setOffreChoisie(e.target.value)}
              className="rounded-carte border border-bordure bg-surface px-4 py-3"
            >
              {offres.map((offre) => (
                <option key={offre.id} value={offre.id}>
                  {offre.intituleDiplome}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">Niveau</span>
            <select
              name="niveauId"
              className="rounded-carte border border-bordure bg-surface px-4 py-3"
            >
              {niveaux.map((niveau) => (
                <option key={niveau.id} value={niveau.id}>
                  {niveau.intitule}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-2">
            <span className="text-sm font-medium">Année scolaire</span>
            <select
              name="anneeId"
              className="rounded-carte border border-bordure bg-surface px-4 py-3"
            >
              {annees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.libelle}
                </option>
              ))}
            </select>
          </label>

          <input type="hidden" name="annee" value={annee?.libelle.slice(0, 4) ?? '2026'} />

          {etatClasse.erreur ? (
            <p role="alert" className="text-sm text-alerte">
              {etatClasse.erreur}
            </p>
          ) : null}

          <Bouton libelle="Créer la classe" />
        </form>

        {etatClasse.classeId ? (
          <p className="rounded-carte border border-accent/30 bg-accent-doux px-4 py-3">
            Classe <strong className="font-medium">{etatClasse.nom}</strong> créée. Code de
            rattachement :{' '}
            <span className="font-mono tracking-widest">{etatClasse.codeRattachement}</span>
          </p>
        ) : null}
      </section>

      {/* --- 2. Les élèves -------------------------------------------------- */}
      {etatClasse.classeId ? (
        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold">2. Inscrire les élèves</h2>

          <form action={actionImport} className="flex flex-col gap-3">
            <input type="hidden" name="classeId" value={etatClasse.classeId} />

            <label className="flex flex-col gap-2">
              <span className="text-sm font-medium">Liste des élèves</span>
              <span className="text-sm text-mine-doux">
                Un élève par ligne : prénom, puis l’initiale du nom. Colle
                directement depuis ton tableur. Nous ne conservons rien d’autre —
                ni nom complet, ni date de naissance, ni adresse : ce sont des
                mineurs.
              </span>
              <textarea
                name="liste"
                rows={8}
                required
                placeholder={'Léa;M\nThomas;B\nInès;K'}
                className="rounded-carte border border-bordure bg-surface px-4 py-3 font-mono text-sm"
              />
            </label>

            {etatImport.erreur ? (
              <p role="alert" className="text-sm text-alerte">
                {etatImport.erreur}
              </p>
            ) : null}

            <Bouton libelle="Créer les accès" />
          </form>

          {etatImport.colonnesIgnorees ? (
            <p className="text-sm text-mine-doux">
              {etatImport.colonnesIgnorees} colonne
              {etatImport.colonnesIgnorees > 1 ? 's ont' : ' a'} été ignorée
              {etatImport.colonnesIgnorees > 1 ? 's' : ''} : seuls le prénom et
              l’initiale sont conservés.
            </p>
          ) : null}

          {etatImport.rejetes && etatImport.rejetes.length > 0 ? (
            <div className="rounded-carte border border-alerte/30 bg-alerte-douce px-4 py-3">
              <p className="font-medium">
                {etatImport.rejetes.length} ligne
                {etatImport.rejetes.length > 1 ? 's' : ''} non retenue
                {etatImport.rejetes.length > 1 ? 's' : ''} :
              </p>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {etatImport.rejetes.map((rejet) => (
                  <li key={rejet.ligne}>
                    Ligne {rejet.ligne} — « {rejet.contenu} » : {rejet.motif}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {etatImport.acces && etatImport.acces.length > 0 ? (
            <RemiseAcces acces={etatImport.acces} nomClasse={etatClasse.nom ?? 'classe'} />
          ) : null}
        </section>
      ) : null}

      <Link href="/formateur" className="text-sm underline print:hidden">
        Aller à l’espace formateur
      </Link>
    </div>
  )
}
