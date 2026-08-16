import Link from 'next/link'
import { Logo } from '../_composants/logo'

export const metadata = {
  title: 'Mentions légales — RAAI Apprendre',
  description:
    'Mentions légales, hébergement et protection des données personnelles de la plateforme RAAI Apprendre.',
}

/**
 * Une page sobre et lisible : les mentions légales sont lues par des
 * directeurs d'établissement et des DPO, pas par des juristes d'affaires.
 * Chaque section dit ce qu'elle a à dire, sans jargon défensif.
 */
export default function PageMentionsLegales() {
  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex max-w-2xl flex-col gap-10 px-6 py-14">
      <nav>
        <Link href="/" className="text-sm text-mine-doux underline">
          ← Accueil
        </Link>
      </nav>

      <header className="flex items-center gap-4">
        <Logo taille={44} />
        <h1 className="text-3xl font-semibold">Mentions légales</h1>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Éditeur</h2>
        <p>
          RAAI Apprendre est éditée par Raphael Lapeze.
          <br />
          Contact :{' '}
          <a href="mailto:raphael.lapeze@gmail.com" className="underline">
            raphael.lapeze@gmail.com
          </a>
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Hébergement</h2>
        <p>
          L’application est hébergée par Vercel Inc. (440 N Barranca Ave #4133,
          Covina, CA 91723, États-Unis). Les données — comptes, contenus
          pédagogiques, résultats — sont stockées par Supabase sur des serveurs
          situés à <strong>Paris, en Union européenne</strong> (région
          eu-west-3), et n’en sortent pas.
        </p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Données personnelles</h2>
        <p>
          Le responsable du traitement est l’éditeur, conjointement avec chaque
          établissement utilisateur pour les données de ses élèves.
        </p>
        <p>
          La plateforme est conçue pour collecter le minimum : les élèves
          mineurs sont enregistrés par leur établissement avec un{' '}
          <strong>prénom et une initiale seulement</strong> — ni adresse
          e-mail, ni nom de famille, ni date de naissance. Ils se connectent
          par un identifiant et un code remis en classe. La lecture des leçons
          n’est pas tracée page à page.
        </p>
        <p>
          Un journal d’audit conserve qui a fait quoi (connexions, notes,
          exports) sans jamais recopier le contenu des données. Les adresses IP
          y sont tronquées : on reconnaît un réseau, jamais un poste.
        </p>
        <p>
          Conformément au RGPD, chaque personne dispose d’un droit d’accès, de
          rectification, de portabilité et d’effacement. Pour les élèves, ces
          demandes passent par l’établissement, qui dispose d’un écran dédié
          (export du dossier, effacement). Pour toute autre demande :{' '}
          <a href="mailto:raphael.lapeze@gmail.com" className="underline">
            raphael.lapeze@gmail.com
          </a>
          . Vous pouvez également saisir la CNIL (cnil.fr).
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Cookies</h2>
        <p>
          La plateforme n’utilise que des cookies strictement nécessaires à la
          connexion (session élève ou compte adulte). Aucun cookie
          publicitaire, aucun traceur tiers, aucune mesure d’audience — c’est
          pourquoi aucune bannière ne vous le demande.
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xl font-semibold">Accessibilité</h2>
        <p>
          La plateforme vise la conformité RGAA niveau AA : navigation au
          clavier, contrastes mesurés, alternatives textuelles sur chaque média
          — y compris les modèles 3D — et information jamais portée par la
          couleur seule. Signalez tout obstacle rencontré à l’adresse
          ci-dessus : il sera traité comme un défaut.
        </p>
      </section>

      <footer className="border-t border-bordure pt-5 text-sm text-mine-doux">
        <p>
          <Link href="/offre" className="underline">
            Notre offre
          </Link>{' '}
          ·{' '}
          <Link href="/" className="underline">
            raai-apprendre.vercel.app
          </Link>
        </p>
      </footer>
    </main>
  )
}
