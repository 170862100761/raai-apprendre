import Link from 'next/link'
import { redirect } from 'next/navigation'
import { prisma } from '@/noyau/prisma'
import { peut } from '@/domaines/identite'
import {
  aSignaler,
  lectureJournalPrisma,
  libelle,
  libelleRole,
  parJournee,
} from '@/domaines/audit'
import { exigerSession } from '../../_session'
import { auditer } from '../../_audit'

export const metadata = { title: 'Journal — RAAI Apprendre' }
export const dynamic = 'force-dynamic'

const LIMITE = 200

const dateLongue = new Intl.DateTimeFormat('fr-FR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'Europe/Paris',
})

const heure = new Intl.DateTimeFormat('fr-FR', {
  hour: '2-digit',
  minute: '2-digit',
  timeZone: 'Europe/Paris',
})

/**
 * Consultation du journal d'audit.
 *
 * Un journal que personne ne peut lire ne prouve rien : il faut qu'un
 * directeur puisse répondre lui-même à « qui a modifié cette note ? », sans
 * demander un accès à la base à quelqu'un.
 *
 * L'écran n'affiche ni qui, ni sur quoi précisément — `lire_journal` ne renvoie
 * pas ces colonnes. Remonter à une personne relève de l'enquête motivée, pas de
 * la consultation courante ; et un écran qui listerait nommément les échecs de
 * connexion des élèves deviendrait lui-même un fichier de surveillance.
 */
export default async function PageJournal() {
  const session = await exigerSession()

  if (!peut(session, 'journal.consulter').autorise) redirect('/formateur')
  if (!session.etablissementId) redirect('/connexion-formateur')

  const lignes = await lectureJournalPrisma(prisma).lire(session.etablissementId, LIMITE)

  // Consulter le journal est une action sensible : elle laisse une trace, comme
  // le reste. Un registre que son lecteur peut parcourir sans être vu ne serait
  // opposable qu'aux autres.
  await auditer('donnees.consultees', session, { type: 'journal' })

  const journees = parJournee(lignes)

  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Journal</h1>
        <p className="text-mine-doux">
          Les {LIMITE} dernières actions enregistrées pour l’établissement. Le
          journal conserve qui a fait quoi, jamais la valeur modifiée.
        </p>
        <Link href="/administration" className="text-sm underline">
          Retour à la mise en route
        </Link>
      </header>

      {journees.length === 0 ? (
        <p className="rounded-carte border border-bordure bg-surface px-4 py-6 text-mine-doux">
          Aucune action enregistrée pour le moment.
        </p>
      ) : null}

      {journees.map((journee) => (
        <section key={journee.jour} className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-mine-doux">
            {dateLongue.format(new Date(`${journee.jour}T12:00:00Z`))}
          </h2>

          <ul className="flex flex-col divide-y divide-bordure rounded-carte border border-bordure">
            {journee.lignes.map((ligne, rang) => (
              <li
                key={`${journee.jour}-${rang}`}
                className="flex flex-wrap items-baseline gap-x-3 gap-y-1 px-4 py-3"
              >
                <time
                  dateTime={ligne.survenuLe.toISOString()}
                  className="w-14 shrink-0 tabular-nums text-sm text-mine-doux"
                >
                  {heure.format(ligne.survenuLe)}
                </time>

                <span className="font-medium">
                  {libelle(ligne.action)}
                  {/* Jamais la couleur seule : une pastille colorée est
                      invisible pour un daltonien, et le signalement porterait
                      alors sur rien. */}
                  {aSignaler(ligne.action) ? (
                    <span className="ml-2 rounded border border-alerte/30 bg-alerte-douce px-1.5 py-0.5 text-xs text-alerte">
                      à justifier
                    </span>
                  ) : null}
                </span>

                <span className="text-sm text-mine-doux">
                  {libelleRole(ligne.roleEffectif)} · {ligne.ressourceType}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
