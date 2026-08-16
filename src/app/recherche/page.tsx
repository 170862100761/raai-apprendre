import Link from 'next/link'
import { prisma } from '@/noyau/prisma'
import { aRole } from '@/domaines/identite'
import {
  chercher,
  depotCataloguePrisma,
  LONGUEUR_MINIMALE,
  type Cherchable,
} from '@/domaines/catalogue'
import { depotMediathequePrisma } from '@/domaines/mediatheque'
import type { IdentifiantApprenant } from '@/noyau/identifiants'
import { exigerSession } from '../_session'

export const metadata = { title: 'Recherche — RAAI Apprendre' }
export const dynamic = 'force-dynamic'

type Categorie = 'Leçon' | 'Compétence' | 'Ressource'

type Trouvee = Cherchable & {
  readonly categorie: Categorie
  readonly detail: string
  /** `null` quand rien n'existe encore à ouvrir — une compétence se lit, elle ne se visite pas. */
  readonly lien: string | null
}

/**
 * Recherche dans les leçons, les compétences du diplôme et les ressources.
 *
 * Deux périmètres, une seule page : un élève cherche dans SON parcours, un
 * adulte dans les leçons de son établissement. Le filtrage ne se fait donc pas
 * dans la recherche — il est déjà fait par la requête qui charge la liste, et
 * donc par la RLS. Chercher ne donne jamais accès à ce qu'on ne pouvait pas
 * déjà lire, et c'est ce qui rend cette page sûre sans SQL supplémentaire.
 *
 * Les ressources de la médiathèque ne sortent que pour les adultes : un élève
 * y accède au travers des leçons, et lui offrir la bibliothèque brute
 * exposerait des supports non encore publiés.
 *
 * Un formulaire GET, pas de saisie instantanée : le résultat est une URL qu'un
 * enseignant peut envoyer à un collègue, et la page fonctionne sans JavaScript.
 */
export default async function PageRecherche({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const session = await exigerSession()
  const { q } = await searchParams
  const saisie = q ?? ''

  const depot = depotCataloguePrisma(prisma)
  const estApprenant = aRole(session, 'apprenant')

  const candidates: Trouvee[] = []

  if (estApprenant) {
    const lecons = await depot.parcoursDeLApprenant(
      session.sujetId as IdentifiantApprenant,
    )
    for (const lecon of lecons) {
      candidates.push({
        categorie: 'Leçon',
        titre: lecon.titre,
        chapitre: lecon.chapitre,
        detail: `${lecon.chapitre} · ${lecon.dureeEstimeeMin} min`,
        lien: `/cours/${lecon.id}`,
      })
    }
  } else if (session.etablissementId) {
    const lecons = await depot.leconsDeLEtablissement(session.etablissementId)
    for (const lecon of lecons) {
      candidates.push({
        categorie: 'Leçon',
        titre: lecon.titre,
        chapitre: lecon.chapitre,
        detail: `${lecon.chapitre} · ${lecon.statut}`,
        lien: `/formateur/lecon/${lecon.id}`,
      })
    }
  }

  if (session.etablissementId) {
    const competences = await depot.competencesDuDiplome(session.etablissementId)
    for (const competence of competences) {
      candidates.push({
        categorie: 'Compétence',
        titre: competence.intitule,
        chapitre: competence.code,
        detail: competence.code,
        lien: null,
      })
    }

    if (!estApprenant) {
      const ressources = await depotMediathequePrisma(prisma).ressourcesDeLEtablissement(
        session.etablissementId,
      )
      for (const ressource of ressources) {
        candidates.push({
          categorie: 'Ressource',
          titre: ressource.nom,
          chapitre: 'Médiathèque',
          detail: ressource.typeMime,
          lien: `/api/v1/medias/${ressource.id}`,
        })
      }
    }
  }

  const trouvees = chercher(candidates, saisie)
  const cherche = saisie.trim().length > 0

  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-10">
      <h1 className="text-2xl font-semibold">Rechercher</h1>

      <form method="get" className="flex flex-col gap-2" role="search">
        <label htmlFor="q" className="text-sm font-medium">
          Un mot du titre, d’une compétence ou d’une ressource
        </label>
        <div className="flex gap-2">
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={saisie}
            spellCheck={false}
            className="flex-1 rounded-carte border border-bordure bg-surface px-4 py-3 text-base"
          />
          <button
            type="submit"
            className="rounded-carte bg-accent px-5 py-3 font-medium text-accent-contraste"
          >
            Chercher
          </button>
        </div>
        <p className="text-sm text-mine-doux">
          Les accents ne comptent pas : « securite » trouve « sécurité ».
        </p>
      </form>

      {/* `aria-live` : sans cela, un lecteur d'écran n'annonce pas que le
          nombre de résultats a changé après une nouvelle recherche. */}
      <section aria-live="polite" className="flex flex-col gap-3">
        {cherche && trouvees.length === 0 ? (
          <p className="rounded-carte border border-bordure bg-surface px-4 py-6 text-mine-doux">
            Aucun résultat pour « {saisie} ». Essaie un autre mot, ou un mot plus
            long — en dessous de {LONGUEUR_MINIMALE} lettres, un mot n’est pas
            pris en compte.
          </p>
        ) : null}

        {trouvees.length > 0 ? (
          <p className="text-sm text-mine-doux">
            {trouvees.length} résultat{trouvees.length > 1 ? 's' : ''}
          </p>
        ) : null}

        <ul className="flex flex-col gap-2">
          {trouvees.map(({ sujet }, rang) => {
            const interieur = (
              <>
                <span className="flex items-baseline gap-2">
                  <span className="font-medium">{sujet.titre}</span>
                  <span className="text-xs uppercase tracking-wide text-mine-doux">
                    {sujet.categorie}
                  </span>
                </span>
                <span className="text-sm text-mine-doux">{sujet.detail}</span>
              </>
            )
            return (
              <li key={rang}>
                {sujet.lien ? (
                  <Link
                    href={sujet.lien}
                    className="flex flex-col gap-1 rounded-carte border border-bordure
                               bg-surface px-4 py-3 hover:border-accent"
                  >
                    {interieur}
                  </Link>
                ) : (
                  <span
                    className="flex flex-col gap-1 rounded-carte border border-bordure
                               bg-surface px-4 py-3"
                  >
                    {interieur}
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      </section>
    </main>
  )
}
