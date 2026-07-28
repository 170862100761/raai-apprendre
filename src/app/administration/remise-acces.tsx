'use client'

import { useState } from 'react'
import type { AccesEleve } from '@/domaines/organisation'

/**
 * La remise des identifiants.
 *
 * C'est l'écran le plus délicat de toute l'administration, pour une raison
 * simple : **les codes ne s'affichent qu'ici, une seule fois.** Ils sont hachés
 * en base, donc irrécupérables — ce qui est précisément ce qui rend acceptable
 * un secret à quatre chiffres pour des mineurs.
 *
 * L'interface doit donc être franche : dire que c'est la seule fois, proposer
 * d'imprimer et de télécharger, et ne rien fermer par inadvertance.
 */
export function RemiseAcces({
  acces,
  nomClasse,
}: {
  acces: readonly AccesEleve[]
  nomClasse: string
}) {
  const [copie, setCopie] = useState(false)

  const texte = acces
    .map((a) => `${a.prenom} ${a.initialeNom}.\t${a.identifiant}\t${a.code}`)
    .join('\n')

  const telecharger = () => {
    // Généré dans le navigateur : les codes ne repassent pas par le serveur,
    // et n'atterrissent donc dans aucun journal d'accès.
    const contenu =
      '﻿' +
      [
        ['Élève', 'Identifiant', 'Code'].join(';'),
        ...acces.map((a) => [`${a.prenom} ${a.initialeNom}.`, a.identifiant, a.code].join(';')),
      ].join('\r\n')

    const lien = document.createElement('a')
    lien.href = URL.createObjectURL(new Blob([contenu], { type: 'text/csv;charset=utf-8' }))
    lien.download = `acces-${nomClasse.replace(/[^A-Za-z0-9]/g, '-').toLowerCase()}.csv`
    lien.click()
    URL.revokeObjectURL(lien.href)
  }

  return (
    <section className="flex flex-col gap-4 rounded-carte border border-accent/40 bg-accent-doux p-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">
          {acces.length} accès créé{acces.length > 1 ? 's' : ''}
        </h2>
        <p>
          <strong className="font-medium">
            C’est la seule fois que ces codes s’affichent.
          </strong>{' '}
          Ils sont chiffrés en base : ni toi, ni nous, ni personne ne pourra les
          relire. Imprime ou télécharge cette liste avant de quitter la page — en
          cas de perte, il faudra régénérer un code.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        <button
          type="button"
          onClick={telecharger}
          className="rounded-carte bg-accent px-4 py-2 text-sm font-medium text-accent-contraste"
        >
          Télécharger la liste
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-carte border border-bordure px-4 py-2 text-sm"
        >
          Imprimer
        </button>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(texte)
            setCopie(true)
          }}
          className="rounded-carte border border-bordure px-4 py-2 text-sm"
        >
          {copie ? 'Copié' : 'Copier'}
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">Identifiants et codes des élèves</caption>
          <thead>
            <tr className="border-b border-bordure">
              <th scope="col" className="px-3 py-2 text-left">Élève</th>
              <th scope="col" className="px-3 py-2 text-left">Identifiant</th>
              <th scope="col" className="px-3 py-2 text-left">Code</th>
            </tr>
          </thead>
          <tbody>
            {acces.map((eleve) => (
              <tr key={eleve.apprenantId} className="border-b border-bordure/50">
                <td className="whitespace-nowrap px-3 py-2">
                  {eleve.prenom} {eleve.initialeNom}.
                </td>
                <td className="px-3 py-2 font-mono">{eleve.identifiant}</td>
                <td className="px-3 py-2 font-mono text-lg tracking-widest">{eleve.code}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
