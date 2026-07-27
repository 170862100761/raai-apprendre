import { redirect } from 'next/navigation'
import { sessionCourante } from '../_session'
import { FormulaireConnexion } from './formulaire'

export const metadata = { title: 'Connexion — RAAI Apprendre' }

export default async function PageConnexion({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string; erreur?: string }>
}) {
  const { suite, erreur } = await searchParams

  // Déjà connecté : inutile de redemander.
  const session = await sessionCourante()
  if (session.sujetId !== null) redirect('/aujourdhui')

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Connexion</h1>
        <p className="text-mine-doux">
          Ton identifiant et ton code à 4 chiffres t’ont été remis par ton
          formateur.
        </p>
      </header>

      {erreur === 'configuration' ? (
        <p
          role="alert"
          className="rounded-carte border border-alerte/30 bg-alerte-douce px-4 py-3 text-sm text-alerte"
        >
          Le service est momentanément indisponible. Préviens ton formateur.
        </p>
      ) : null}

      <FormulaireConnexion {...(suite ? { suite } : {})} />

      <p className="text-sm text-mine-doux">
        Code oublié ou accès bloqué ? Seul ton formateur peut le réinitialiser —
        nous n’avons ni ton adresse e-mail ni ton nom de famille.
      </p>
    </main>
  )
}
