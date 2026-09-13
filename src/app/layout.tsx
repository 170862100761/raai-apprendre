import type { Metadata, Viewport } from 'next'
import { Analytics } from '@vercel/analytics/next'
import './globals.css'

export const metadata: Metadata = {
  title: 'RAAI Apprendre',
  description:
    "Plateforme pédagogique de l'enseignement agricole et technique.",
  // Aucune donnée d'élève ne doit se retrouver indexée ou partagée.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Le zoom reste possible : le bloquer exclut les élèves malvoyants.
  maximumScale: 5,
}

export default function RacineLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh">
        {/* Premier élément focusable de la page : il permet de sauter les
            en-têtes répétés plutôt que de les retraverser à chaque écran.
            La cible est le `<main>` que porte chaque page. */}
        <a href="#contenu" className="lien-evitement">
          Aller au contenu
        </a>
        {children}
        <Analytics />
      </body>
    </html>
  )
}
