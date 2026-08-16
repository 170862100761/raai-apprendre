import Link from 'next/link'
import { Logo } from '../_composants/logo'

export const metadata = {
  title: 'L’offre — RAAI Apprendre',
  description:
    'Un abonnement par siège élève, sans engagement ni frais d’installation, pour les MFR, lycées professionnels et CFA.',
}

const INCLUS = [
  'Leçons interactives : texte, schémas, vidéo, modèles 3D manipulables',
  'Quiz auto-corrigés, devoirs à rendre, correction en ligne',
  'Suivi du référentiel officiel : grille classe × compétences, exports PDF, Excel et CSV',
  'Import assisté des référentiels ChloroFil',
  'Comptes élèves sans e-mail ni nom de famille — conçus pour les mineurs',
  'Journal d’audit, registre RGPD, export et effacement des dossiers',
  'Mises à jour continues, données hébergées à Paris',
] as const

const ETAPES = [
  ['Créer votre établissement', 'Un échange pour créer votre espace et importer votre référentiel — nous nous en chargeons avec vous.'],
  ['Mettre en route une classe', 'Collez votre liste d’élèves, imprimez les codes, distribuez-les : une séance suffit.'],
  ['Reprendre votre contenu', 'Vos supports existants sont convertis en leçons relisibles bloc par bloc — la reprise est comprise.'],
] as const

export default function PageOffre() {
  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex max-w-2xl flex-col gap-12 px-6 py-14">
      <nav>
        <Link href="/" className="text-sm text-mine-doux underline">
          ← Accueil
        </Link>
      </nav>

      <header className="flex flex-col gap-4">
        <div className="flex items-center gap-4">
          <Logo taille={44} />
          <h1 className="text-3xl font-semibold">Une offre, sans étage caché</h1>
        </div>
        <p className="text-lg text-mine-doux">
          Pas de version « premium », pas d’options à déverrouiller : chaque
          établissement a la plateforme entière. On paie pour les élèves
          inscrits, et c’est tout.
        </p>
      </header>

      <section
        aria-labelledby="tarif"
        className="flex flex-col gap-4 rounded-carte border border-bordure bg-surface p-7"
      >
        <h2 id="tarif" className="text-2xl font-semibold">
          3 € par élève et par mois
        </h2>
        <ul className="flex flex-col gap-2">
          {INCLUS.map((point) => (
            <li key={point} className="flex gap-3 text-mine-doux">
              <span aria-hidden="true" className="text-accent">
                —
              </span>
              {point}
            </li>
          ))}
        </ul>
        <p className="text-sm text-mine-doux">
          Sans engagement, résiliable à tout moment depuis votre espace
          d’administration. Pas de frais d’installation. Et si vos inscriptions
          dépassent vos sièges, <strong>aucun élève n’est jamais coupé</strong>{' '}
          — vous ajustez quand vous voulez.
        </p>
      </section>

      <section aria-labelledby="demarrage" className="flex flex-col gap-4">
        <h2 id="demarrage" className="text-2xl font-semibold">
          Démarrer prend des jours, pas des mois
        </h2>
        <ol className="flex flex-col gap-4">
          {ETAPES.map(([titre, texte], rang) => (
            <li
              key={titre}
              className="flex gap-4 rounded-carte border border-bordure bg-surface p-5"
            >
              <span
                aria-hidden="true"
                className="font-semibold text-accent"
                style={{ fontFamily: 'Georgia, serif', fontSize: '1.4rem' }}
              >
                {rang + 1}.
              </span>
              <span className="flex flex-col gap-1">
                <span className="font-semibold">{titre}</span>
                <span className="text-sm text-mine-doux">{texte}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-3 rounded-carte bg-accent p-7 text-accent-contraste">
        <h2 className="text-2xl font-semibold">Voir la plateforme en vrai</h2>
        <p className="opacity-90">
          Démonstration guidée sur vos propres référentiels, sans engagement.
        </p>
        <a
          href="mailto:raphael.lapeze@gmail.com"
          className="w-fit rounded-carte bg-surface px-5 py-3 font-medium text-mine"
        >
          raphael.lapeze@gmail.com
        </a>
      </section>

      <footer className="border-t border-bordure pt-5 text-sm text-mine-doux">
        <Link href="/mentions-legales" className="underline">
          Mentions légales
        </Link>
      </footer>
    </main>
  )
}
