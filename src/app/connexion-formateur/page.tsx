import Link from 'next/link'
import { redirect } from 'next/navigation'
import { sessionCourante } from '../_session'
import { FormulaireFormateur } from './formulaire'

export const metadata = { title: 'Espace formateur — RAAI Apprendre' }
export const dynamic = 'force-dynamic'

export default async function PageConnexionFormateur({
  searchParams,
}: {
  searchParams: Promise<{ suite?: string }>
}) {
  const { suite } = await searchParams

  const session = await sessionCourante()
  if (session.origine === 'compte') redirect('/formateur')

  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Espace formateur</h1>
        <p className="text-mine-doux">
          Connexion des enseignants, formateurs et personnels de direction, par
          adresse e-mail et mot de passe.
        </p>
      </header>

      <FormulaireFormateur {...(suite ? { suite } : {})} />

      {/* La phrase renvoyait les élèves « à la page d'accueil » sans lien : un
          élève arrivé ici par erreur devait deviner. */}
      <p className="text-sm text-mine-doux">
        Tu es élève ?{' '}
        <Link href="/connexion" className="underline">
          Connexion avec ton identifiant et ton code
        </Link>
      </p>
    </main>
  )
}
