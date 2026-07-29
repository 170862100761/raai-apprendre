import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/noyau/prisma'
import { depotCataloguePrisma } from '@/domaines/catalogue'
import { peut } from '@/domaines/identite'
import { exigerSession } from '../_session'
import { deconnecterFormateur } from '../connexion-formateur/actions'

export const metadata = { title: 'Mes leçons — RAAI Apprendre' }
export const dynamic = 'force-dynamic'

const LIBELLES: Record<string, string> = {
  brouillon: 'Brouillon',
  en_relecture: 'En relecture',
  publiee: 'Publiée',
  archivee: 'Archivée',
}

export default async function PageFormateur() {
  const session = await exigerSession()

  if (!peut(session, 'lecon.ecrire').autorise) redirect('/aujourdhui')
  if (!session.etablissementId) redirect('/connexion-formateur')

  const lecons = await depotCataloguePrisma(prisma).leconsDeLEtablissement(
    session.etablissementId,
  )

  // Les classes que ce compte encadre réellement. Sans affectation, un
  // enseignant ne voit aucun élève — la liste est donc vide, et c'est juste.
  const classes = await prisma.classe.findMany({
    where: { id: { in: [...session.classes] }, archivee: false },
    orderBy: { nom: 'asc' },
    select: { id: true, nom: true, _count: { select: { inscriptions: true } } },
  })

  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-2xl font-semibold">Mes leçons</h1>
        <Link href="/formateur/corrections" className="text-sm underline">
          Copies à corriger
        </Link>
        <Link href="/recherche" className="text-sm underline">
          Rechercher
        </Link>
        <form action={deconnecterFormateur}>
          <button type="submit" className="text-sm text-mine-doux underline">
            Se déconnecter
          </button>
        </form>
      </header>

      {classes.length > 0 ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-mine-doux">Mes classes</h2>
          <ul className="flex flex-wrap gap-2">
            {classes.map((classe) => (
              <li key={classe.id}>
                <Link
                  href={`/formateur/classe/${classe.id}`}
                  className="flex flex-col rounded-carte border border-bordure px-4 py-3 hover:bg-surface-2"
                >
                  <span className="font-medium">{classe.nom}</span>
                  <span className="text-sm text-mine-doux">
                    {classe._count.inscriptions} élève
                    {classe._count.inscriptions > 1 ? 's' : ''} · suivi des compétences
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {peut(session, 'classe.creer').autorise ? (
        <Link href="/administration" className="w-fit text-sm underline">
          Mise en route : créer une classe, inscrire des élèves
        </Link>
      ) : null}

      <Link
        href="/formateur/lecon/nouvelle"
        className="w-fit rounded-carte bg-accent px-5 py-3 font-medium text-accent-contraste"
      >
        Nouvelle leçon
      </Link>

      {lecons.length === 0 ? (
        <p className="rounded-carte border border-bordure px-4 py-8 text-center text-mine-doux">
          Aucune leçon pour l’instant. Crée la première : cela prend moins de dix
          minutes.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lecons.map((lecon) => (
            <li key={lecon.id}>
              <Link
                href={`/formateur/lecon/${lecon.id}`}
                className="flex flex-col gap-1 rounded-carte border border-bordure px-4 py-4 hover:bg-surface-2"
              >
                <span className="flex items-baseline justify-between gap-4">
                  <span className="font-medium">{lecon.titre}</span>
                  <span
                    className={`shrink-0 text-sm ${
                      lecon.statut === 'publiee' ? 'text-accent' : 'text-mine-doux'
                    }`}
                  >
                    {LIBELLES[lecon.statut] ?? lecon.statut}
                  </span>
                </span>
                <span className="text-sm text-mine-doux">
                  {lecon.chapitre} · {lecon.nombreBlocs} contenu
                  {lecon.nombreBlocs > 1 ? 's' : ''} ·{' '}
                  {/* Une leçon sans compétence ne comptera dans aucune
                      progression : c'est signalé ici, pas seulement au moment
                      de publier. */}
                  {lecon.nombreCompetences === 0 ? (
                    <span className="text-alerte">aucune compétence rattachée</span>
                  ) : (
                    `${lecon.nombreCompetences} compétence${lecon.nombreCompetences > 1 ? 's' : ''}`
                  )}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
