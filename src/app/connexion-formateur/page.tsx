import { redirect } from 'next/navigation'
import { sessionCourante } from '../_session'
import { FormulaireFormateur } from './formulaire'

export const metadata = { title: 'Espace formateur — RAAI Apprendre' }
export const dynamic = 'force-dynamic'

export default async function PageConnexionFormateur() {
  const session = await sessionCourante()
  if (session.origine === 'compte') redirect('/formateur')

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Espace formateur</h1>
        <p className="text-mine-doux">
          Les élèves se connectent depuis la page d’accueil, avec leur
          identifiant et leur code.
        </p>
      </header>

      <FormulaireFormateur />
    </main>
  )
}
