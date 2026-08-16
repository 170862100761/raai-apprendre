'use client'

import { useEffect, useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

type Phase = 'verification' | 'pret' | 'enregistre' | 'lien_invalide'

/**
 * La clé anonyme est publique par conception (seule exception nominative au
 * contrôle anti-secrets) ; sans les variables Supabase, cet écran n'a pas de
 * raison d'être et le dit.
 */
function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const cle = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !cle) return null
  return createBrowserClient(url, cle)
}

export function Formulaire() {
  const [phase, setPhase] = useState<Phase>('verification')
  const [erreur, setErreur] = useState<string | null>(null)
  const [motDePasse, setMotDePasse] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [enCours, setEnCours] = useState(false)

  useEffect(() => {
    const supabase = client()
    if (!supabase) {
      setPhase('lien_invalide')
      setErreur('Cette instance n’utilise pas Supabase.')
      return
    }
    // Le lien de récupération a ouvert une session ; sans elle, l'écran ne
    // sert à rien et le dire vaut mieux qu'un échec silencieux à l'envoi.
    void supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setPhase('pret')
      } else {
        setPhase('lien_invalide')
        setErreur('Lien expiré ou déjà utilisé. Demande un nouveau lien de réinitialisation.')
      }
    })
  }, [])

  async function enregistrer(evenement: React.FormEvent) {
    evenement.preventDefault()
    if (motDePasse.length < 12) {
      setErreur('Au moins douze caractères.')
      return
    }
    if (motDePasse !== confirmation) {
      setErreur('Les deux saisies ne correspondent pas.')
      return
    }
    const supabase = client()
    if (!supabase) return

    setEnCours(true)
    const { error } = await supabase.auth.updateUser({ password: motDePasse })
    setEnCours(false)
    if (error) setErreur(error.message)
    else setPhase('enregistre')
  }

  if (phase === 'verification') {
    return <p className="text-mine-doux">Vérification du lien…</p>
  }

  if (phase === 'enregistre') {
    return (
      <div className="flex flex-col gap-3">
        <p className="rounded-carte border border-bordure bg-surface px-4 py-3">
          Mot de passe enregistré. Tu peux te connecter.
        </p>
        <a href="/connexion-formateur" className="w-fit underline">
          Aller à la connexion
        </a>
      </div>
    )
  }

  return (
    <form onSubmit={enregistrer} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        Nouveau mot de passe (au moins douze caractères)
        <input
          type="password"
          value={motDePasse}
          onChange={(e) => setMotDePasse(e.target.value)}
          minLength={12}
          required
          autoComplete="new-password"
          className="rounded-carte border border-bordure bg-surface px-4 py-3 text-base"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Confirme-le
        <input
          type="password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          required
          autoComplete="new-password"
          className="rounded-carte border border-bordure bg-surface px-4 py-3 text-base"
        />
      </label>

      {erreur ? (
        <p role="alert" className="rounded-carte border border-alerte/40 bg-alerte-douce px-4 py-3 text-sm text-alerte">
          {erreur}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={enCours || phase !== 'pret'}
        className="w-fit rounded-carte bg-accent px-5 py-3 font-medium text-accent-contraste
                   disabled:opacity-60"
      >
        {enCours ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </form>
  )
}
