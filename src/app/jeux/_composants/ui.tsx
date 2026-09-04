import type { ReactNode } from 'react'

/* Briques partagées par les cinq jeux, aux jetons d'Apprendre. */

export function Carte({
  children,
  className = '',
  occupe = false,
}: {
  children: ReactNode
  className?: string
  occupe?: boolean
}) {
  return (
    <section
      aria-busy={occupe || undefined}
      className={`rounded-carte border border-bordure bg-surface p-5 ${className}`}
    >
      {children}
    </section>
  )
}

export function BoutonPrincipal({
  children,
  onClick,
  className = '',
}: {
  children: ReactNode
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-carte bg-accent px-5 py-3 font-medium text-accent-contraste
                  transition-opacity hover:opacity-90 ${className}`}
    >
      {children}
    </button>
  )
}

/** Anneau de score : la valeur est aussi écrite au centre, jamais la couleur seule. */
export function Anneau({
  pourcentage,
  libelle,
  taille = 96,
}: {
  pourcentage: number
  libelle: string
  taille?: number
}) {
  const creux = taille * 0.77
  return (
    <div
      className="flex items-center justify-center rounded-full"
      role="img"
      aria-label={`${libelle}, soit ${pourcentage} %`}
      style={{
        width: taille,
        height: taille,
        background: `conic-gradient(var(--color-accent) ${pourcentage * 3.6}deg, var(--color-surface-2) 0deg)`,
      }}
    >
      <div
        className="flex items-center justify-center rounded-full bg-surface font-semibold tabular-nums"
        style={{ width: creux, height: creux, fontSize: taille * 0.21 }}
      >
        {libelle}
      </div>
    </div>
  )
}

/** Barre de temps restant : passe à l'alerte sous 30 %. */
export function BarreTemps({ part }: { part: number }) {
  return (
    <div className="mb-5 h-1.5 overflow-hidden rounded-full bg-surface-2" role="presentation">
      <div
        className={`h-full rounded-full transition-[width] duration-100 ease-linear ${
          part < 30 ? 'bg-alerte' : 'bg-accent'
        }`}
        style={{ width: `${part}%` }}
      />
    </div>
  )
}

export const LETTRES = ['A', 'B', 'C', 'D']

export function Lettre({ lettre }: { lettre: string }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-surface-2 text-xs font-semibold text-mine-doux"
    >
      {lettre}
    </span>
  )
}

export function melanger<T>(liste: T[]): T[] {
  const t = [...liste]
  for (let i = t.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = t[i]
    const b = t[j]
    if (a !== undefined && b !== undefined) {
      t[i] = b
      t[j] = a
    }
  }
  return t
}
