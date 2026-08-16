import { Formulaire } from './formulaire'

export const metadata = { title: 'Définir mon mot de passe — RAAI Apprendre' }

/**
 * Point d'arrivée du lien de réinitialisation Supabase (doc 13 §4).
 *
 * Le lien ouvre une session de récupération ; cet écran ne fait qu'une chose :
 * demander le nouveau mot de passe et l'enregistrer via Supabase Auth. Le mot
 * de passe ne transite que du navigateur vers Supabase — jamais par nos
 * serveurs, et personne d'autre que l'intéressé ne le choisit.
 */
export default function PageDefinirMotDePasse() {
  return (
    <main id="contenu" tabIndex={-1} className="mx-auto flex max-w-md flex-col gap-6 px-6 py-16">
      <h1 className="text-2xl font-semibold">Définir mon mot de passe</h1>
      <Formulaire />
    </main>
  )
}
