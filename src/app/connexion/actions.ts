'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/noyau/prisma'
import {
  COOKIE_APPRENANT,
  OPTIONS_COOKIE,
  signerJeton,
} from '@/noyau/cookie-session'
import { auditerAnonyme } from '../_audit'
import {
  depotIdentitePrisma,
  hachageBcrypt,
  HORLOGE_SYSTEME,
  ouvrirSessionApprenant,
  DUREE_SESSION_JOURS,
} from '@/domaines/identite'

export type EtatConnexion = {
  readonly erreur?: string
  readonly champs?: Readonly<Record<string, string>>
}

const Entree = z.object({
  identifiant: z.string().min(1, 'Saisis ton identifiant.').max(120),
  code: z.string().regex(/^\d{4}$/, 'Le code comporte 4 chiffres.'),
  suite: z.string().optional(),
})

/** Ne suit que des chemins internes : `suite` vient de l'URL, donc de l'extérieur. */
function destination(suite: string | undefined): string {
  if (!suite || !suite.startsWith('/') || suite.startsWith('//')) return '/aujourdhui'
  return suite
}

export async function connecter(
  _precedent: EtatConnexion,
  donnees: FormData,
): Promise<EtatConnexion> {
  // 1. Authentifier — sans objet ici : c'est l'action qui authentifie.
  // 2. Valider
  const entree = Entree.safeParse({
    identifiant: donnees.get('identifiant'),
    code: donnees.get('code'),
    suite: donnees.get('suite') ?? undefined,
  })

  if (!entree.success) {
    const champs: Record<string, string> = {}
    for (const probleme of entree.error.issues) {
      const champ = probleme.path[0]
      if (typeof champ === 'string' && !champs[champ]) champs[champ] = probleme.message
    }
    return { erreur: 'Vérifie ta saisie.', champs }
  }

  // 3. Autoriser — sans objet : l'action est publique par nature.
  // 4. Exécuter
  const resultat = await ouvrirSessionApprenant(
    { identifiant: entree.data.identifiant, code: entree.data.code },
    {
      depot: depotIdentitePrisma(prisma),
      hachage: hachageBcrypt,
      horloge: HORLOGE_SYSTEME,
    },
  )

  if (!resultat.ok) {
    // Sans cette trace, une attaque par force brute ne laisserait rien
    // derrière elle — précisément le cas où l'on veut une trace.
    await auditerAnonyme(
      resultat.erreur.code === 'compte_verrouille'
        ? 'connexion.verrouillage'
        : 'connexion.echouee',
      { type: 'apprenant' },
    )

    return {
      erreur: resultat.erreur.message,
      ...(resultat.erreur.champs ? { champs: resultat.erreur.champs } : {}),
    }
  }

  const secret = process.env.SECRET_SESSION_APPRENANT
  if (!secret) {
    // Refuser plutôt qu'ouvrir une session non signée.
    return { erreur: "Le service est mal configuré. Préviens ton formateur." }
  }

  const bocal = await cookies()
  bocal.set(COOKIE_APPRENANT, await signerJeton(resultat.valeur.jeton, secret), {
    ...OPTIONS_COOKIE,
    maxAge: DUREE_SESSION_JOURS * 86_400,
  })

  // 5. Invalider — rien en cache à ce stade.
  // 6. Auditer
  await auditerAnonyme('connexion.reussie', { type: 'apprenant' })

  redirect(destination(entree.data.suite))
}

export async function deconnecter(): Promise<void> {
  const bocal = await cookies()
  bocal.delete(COOKIE_APPRENANT)
  redirect('/connexion')
}
