'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/noyau/prisma'
import { COOKIE_COMPTE, OPTIONS_COOKIE, signerJeton } from '@/noyau/cookie-session'
import { auditerAnonyme } from '../_audit'
import {
  depotIdentitePrisma,
  DUREE_SESSION_COMPTE_JOURS,
  hachageBcrypt,
  HORLOGE_SYSTEME,
  ouvrirSessionCompte,
} from '@/domaines/identite'

export type EtatConnexion = { readonly erreur?: string }

const Entree = z.object({
  email: z.string().email('Adresse e-mail invalide.'),
  motDePasse: z.string().min(1, 'Saisis ton mot de passe.'),
})

export async function connecterFormateur(
  _precedent: EtatConnexion,
  donnees: FormData,
): Promise<EtatConnexion> {
  const entree = Entree.safeParse({
    email: donnees.get('email'),
    motDePasse: donnees.get('motDePasse'),
  })
  if (!entree.success) return { erreur: 'Adresse e-mail ou mot de passe incorrect.' }

  const resultat = await ouvrirSessionCompte(entree.data, {
    depot: depotIdentitePrisma(prisma),
    hachage: hachageBcrypt,
    horloge: HORLOGE_SYSTEME,
  })

  if (!resultat.ok) {
    await auditerAnonyme(
      resultat.erreur.code === 'compte_verrouille'
        ? 'connexion.verrouillage'
        : 'connexion.echouee',
      { type: 'compte' },
    )
    return { erreur: resultat.erreur.message }
  }

  const secret = process.env.SECRET_SESSION_APPRENANT
  if (!secret) return { erreur: 'Le service est mal configuré.' }

  const bocal = await cookies()
  bocal.set(COOKIE_COMPTE, await signerJeton(resultat.valeur.jeton, secret), {
    ...OPTIONS_COOKIE,
    maxAge: DUREE_SESSION_COMPTE_JOURS * 86_400,
  })

  await auditerAnonyme('connexion.reussie', { type: 'compte' })

  redirect('/formateur')
}

export async function deconnecterFormateur(): Promise<void> {
  const bocal = await cookies()
  bocal.delete(COOKIE_COMPTE)
  redirect('/connexion-formateur')
}
