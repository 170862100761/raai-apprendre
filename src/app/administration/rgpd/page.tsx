import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/noyau/prisma'
import { peut } from '@/domaines/identite'
import { exigerSession } from '../../_session'
import { DemandesRgpd } from './_formulaires'

export const metadata = { title: 'Demandes RGPD — RAAI Apprendre' }
export const dynamic = 'force-dynamic'

/**
 * Les deux droits qu'un établissement doit pouvoir honorer lui-même.
 *
 * Le document 09 §5 les désigne nommément — portabilité déclenchable par
 * l'administrateur, effacement outillé sous trente jours. Sans cet écran, la
 * seule façon de répondre à une demande était d'écrire du SQL à la main, ce
 * qui revient à ne pas pouvoir y répondre.
 */
export default async function PageRgpd() {
  const session = await exigerSession()

  if (!peut(session, 'apprenant.lire_nominatif').autorise) redirect('/formateur')
  if (!session.etablissementId) redirect('/connexion-formateur')

  // Les élèves déjà anonymisés restent listés : c'est la preuve que la demande
  // a été honorée. Les masquer donnerait l'impression qu'ils ont disparu, et
  // personne ne saurait dire ce qui a été fait.
  const eleves = await prisma.apprenant.findMany({
    where: { etablissementId: session.etablissementId },
    orderBy: [{ actif: 'desc' }, { prenom: 'asc' }],
    select: {
      id: true,
      prenom: true,
      initialeNom: true,
      identifiant: true,
      actif: true,
      inscriptions: { select: { classe: { select: { nom: true } } } },
    },
  })

  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Demandes RGPD</h1>
        <p className="text-mine-doux">
          Remettre à un élève ce qui le concerne, ou honorer une demande
          d’effacement. Les deux actions sont journalisées.
        </p>
      </header>

      <section className="flex flex-col gap-3 rounded-carte border border-bordure px-5 py-4">
        <h2 className="font-medium">Ce qu’un effacement fait, et ne fait pas</h2>
        <p className="text-sm text-mine-doux">
          L’élève est <strong>anonymisé, pas supprimé</strong>. Son prénom, son
          identifiant de connexion et son code disparaissent définitivement. Ses
          acquis et ses évaluations restent, rattachés à un élève anonyme : sans
          cela, la couverture du référentiel de sa classe deviendrait fausse des
          mois plus tard, sans que personne ne comprenne pourquoi.
        </p>
        <p className="text-sm text-mine-doux">
          L’opération est <strong>irréversible</strong> et ne peut pas être
          annulée depuis cette interface.
        </p>
      </section>

      <DemandesRgpd
        eleves={eleves.map((e) => ({
          id: e.id,
          prenom: e.prenom,
          initialeNom: e.initialeNom,
          identifiant: e.identifiant,
          actif: e.actif,
          classes: e.inscriptions.map((i) => i.classe.nom),
        }))}
      />

      <Link href="/administration" className="text-sm underline">
        Retour à la mise en route
      </Link>
    </main>
  )
}
