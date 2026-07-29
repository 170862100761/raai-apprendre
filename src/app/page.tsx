import Link from 'next/link'

export default function Accueil() {
  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-12">
      <h1 className="text-3xl font-semibold">RAAI Apprendre</h1>
      <p className="text-mine-doux">
        Plateforme pédagogique de l’enseignement agricole et technique.
      </p>
      <Link
        href="/connexion"
        className="w-fit rounded-carte bg-accent px-5 py-3 font-medium text-accent-contraste"
      >
        Se connecter
      </Link>

      {/* Le chemin des adultes existait, sans qu'aucun écran n'y mène : un
          formateur arrivant sur l'application n'avait aucun moyen de trouver
          sa connexion. Discret mais présent — l'élève reste le parcours
          principal, il est cent fois plus fréquent. */}
      <p className="text-sm text-mine-doux">
        Enseignant, formateur ou direction ?{' '}
        <Link href="/connexion-formateur" className="underline">
          Connexion de l’établissement
        </Link>
      </p>
    </main>
  )
}
