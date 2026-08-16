import Link from 'next/link'

export const metadata = {
  title: 'RAAI Apprendre — plateforme pédagogique agricole et technique',
  description:
    'Leçons interactives, modèles 3D, quiz auto-corrigés et suivi de compétences ' +
    'pour l’enseignement agricole et technique. Conçue pour les MFR, lycées ' +
    'professionnels et CFA.',
}

const ARGUMENTS = [
  {
    titre: 'Des leçons qui montrent',
    texte:
      'Textes structurés, schémas, vidéos — et des modèles 3D manipulables ' +
      'directement dans le navigateur. Un STEP de constructeur déposé par ' +
      'l’enseignant devient un modèle que l’élève tourne dans tous les sens, ' +
      'même sur un ordinateur modeste.',
  },
  {
    titre: 'Des compétences qui se prouvent',
    texte:
      'Chaque quiz auto-corrigé alimente le suivi du référentiel officiel. ' +
      'La grille classe × compétences répond du même geste à l’enseignant — ' +
      'qui bloque, et sur quoi — et à l’inspection : le référentiel est ' +
      'couvert, et voilà la preuve. Exports PDF, Excel et CSV compris.',
  },
  {
    titre: 'Des acquis qui ne s’effacent pas',
    texte:
      'Un élève qui a validé une compétence puis rate un quiz reste validé : ' +
      'seul un enseignant peut déclarer un recul. La maîtrise exige deux ' +
      'réussites espacées d’une semaine — une réussite unique peut être un ' +
      'coup de chance, pas deux.',
  },
  {
    titre: 'Des mineurs vraiment protégés',
    texte:
      'Les élèves mineurs n’ont ni compte e-mail, ni nom de famille en base : ' +
      'un identifiant et un code à quatre chiffres remis par l’établissement. ' +
      'Prénom et initiale, rien de plus. Le RGPD n’est pas une case cochée, ' +
      'c’est l’architecture.',
  },
] as const

const REPRISE = [
  'Import assisté des référentiels ChloroFil (PDF vers arbre de compétences)',
  'Reprise du contenu existant, converti en leçons relisibles bloc par bloc',
  'Mise en route d’une classe en une séance : liste collée, codes imprimés',
] as const

export default function Accueil() {
  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex max-w-3xl flex-col gap-16 px-6 py-16">
      {/* — Proposition ------------------------------------------------------ */}
      <header className="flex flex-col gap-5">
        <p className="text-sm font-medium uppercase tracking-wide text-mine-doux">
          MFR · Lycées professionnels · CFA
        </p>
        <h1 className="text-4xl font-semibold leading-tight">
          La plateforme pédagogique de l’enseignement agricole et technique
        </h1>
        <p className="max-w-xl text-lg text-mine-doux">
          Des leçons interactives avec modèles 3D, des quiz qui alimentent le
          suivi du référentiel officiel, et une grille de compétences qui
          répond à l’inspection. Pensée pour les élèves d’agroéquipement — et
          pour les enseignants qui n’ont pas de temps à perdre.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <Link
            href="/connexion"
            className="rounded-carte bg-accent px-6 py-3 font-medium text-accent-contraste"
          >
            Connexion élève
          </Link>
          <Link href="/connexion-formateur" className="text-sm underline">
            Espace enseignant et direction
          </Link>
        </div>
      </header>

      {/* — Ce qu'elle fait -------------------------------------------------- */}
      <section aria-labelledby="atouts" className="flex flex-col gap-4">
        <h2 id="atouts" className="text-2xl font-semibold">
          Ce que la plateforme fait, concrètement
        </h2>
        <ul className="grid gap-4 sm:grid-cols-2">
          {ARGUMENTS.map((a) => (
            <li
              key={a.titre}
              className="flex flex-col gap-2 rounded-carte border border-bordure bg-surface p-5"
            >
              <h3 className="font-semibold">{a.titre}</h3>
              <p className="text-sm text-mine-doux">{a.texte}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* — Démarrage -------------------------------------------------------- */}
      <section aria-labelledby="demarrage" className="flex flex-col gap-4">
        <h2 id="demarrage" className="text-2xl font-semibold">
          Un établissement démarre en quelques jours, pas en quelques mois
        </h2>
        <ul className="flex flex-col gap-2">
          {REPRISE.map((point) => (
            <li key={point} className="flex gap-3 text-mine-doux">
              <span aria-hidden="true" className="text-accent">
                —
              </span>
              {point}
            </li>
          ))}
        </ul>
      </section>

      {/* — Tarif ------------------------------------------------------------ */}
      <section
        aria-labelledby="tarif"
        className="flex flex-col gap-3 rounded-carte border border-bordure bg-surface p-6"
      >
        <h2 id="tarif" className="text-2xl font-semibold">
          Un tarif à la mesure d’un établissement
        </h2>
        <p className="text-mine-doux">
          Abonnement par siège élève, géré par l’établissement, résiliable à
          tout moment. Pas de frais d’installation, pas d’engagement annuel :
          on paie pour les élèves inscrits, et un dépassement ne coupe jamais
          l’accès d’un élève.
        </p>
        <p className="text-sm text-mine-doux">
          Contact et démonstration guidée :{' '}
          <a href="mailto:raphael.lapeze@gmail.com" className="underline">
            raphael.lapeze@gmail.com
          </a>
        </p>
      </section>

      <footer className="border-t border-bordure pt-6 text-sm text-mine-doux">
        <p>
          RAAI Apprendre — accessibilité RGAA, données hébergées en Union
          européenne, journal d’audit opposable. Les élèves ne sont jamais
          suivis à la page lue : ce qui n’est pas collecté ne peut pas fuir.
        </p>
      </footer>
    </main>
  )
}
