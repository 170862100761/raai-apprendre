/**
 * Un écran qui affiche des données de démonstration le dit noir sur blanc.
 *
 * Règle héritée de RAAI-Formation, reconduite sans exception : tant qu'une
 * fonctionnalité n'est pas branchée, l'interface ne fait pas semblant. Un
 * enseignant qui découvre après coup qu'un chiffre était factice ne revient pas.
 */
export function BandeauDemo({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-carte border border-dashed border-bordure bg-surface-2 px-4 py-3 text-sm text-mine-doux">
      <strong className="font-medium text-mine">Exemple — </strong>
      {children}
    </p>
  )
}
