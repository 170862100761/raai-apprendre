'use server'

import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/noyau/prisma'
import { COOKIE_COMPTE, OPTIONS_COOKIE, signerJeton } from '@/noyau/cookie-session'
import { auditerAnonyme } from '../_audit'
import { destination } from '../_destination'
import {
  configurationSupabase,
  connecterCompteSupabase,
  deconnecterCompteSupabase,
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
  suite: z.string().optional(),
})

type OptionsCookie = NonNullable<Parameters<Awaited<ReturnType<typeof cookies>>['set']>[2]>

export async function connecterFormateur(
  _precedent: EtatConnexion,
  donnees: FormData,
): Promise<EtatConnexion> {
  const entree = Entree.safeParse({
    email: donnees.get('email'),
    motDePasse: donnees.get('motDePasse'),
    suite: donnees.get('suite') ?? undefined,
  })
  if (!entree.success) return { erreur: 'Adresse e-mail ou mot de passe incorrect.' }

  // Même bascule que `sessionCourante()` : Supabase configuré, c'est lui qui
  // authentifie ET qui pose ses cookies. Une connexion par le chemin
  // transitoire poserait un cookie que la lecture de session ignorerait —
  // l'utilisateur se connecterait « avec succès » dans une boucle sans fin.
  const configuration = configurationSupabase()

  if (configuration) {
    const bocal = await cookies()
    const compteId = await connecterCompteSupabase(
      configuration,
      { email: entree.data.email, motDePasse: entree.data.motDePasse },
      {
        lire: () => bocal.getAll().map((c) => ({ name: c.name, value: c.value })),
        poser: (aPoser) => {
          for (const c of aPoser) bocal.set(c.name, c.value, (c.options ?? {}) as OptionsCookie)
        },
      },
    )

    if (!compteId) {
      await auditerAnonyme('connexion.echouee', { type: 'compte' })
      return { erreur: 'Adresse e-mail ou mot de passe incorrect.' }
    }

    await auditerAnonyme('connexion.reussie', { type: 'compte' })
    redirect(destination(entree.data.suite, '/formateur'))
  }

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

  redirect(destination(entree.data.suite, '/formateur'))
}

export async function deconnecterFormateur(): Promise<void> {
  const bocal = await cookies()

  // Révoquer la session Supabase, pas seulement effacer nos cookies : un JWT
  // encore valide dans un onglet oublié resterait une session ouverte.
  const configuration = configurationSupabase()
  if (configuration) {
    await deconnecterCompteSupabase(configuration, {
      lire: () => bocal.getAll().map((c) => ({ name: c.name, value: c.value })),
      poser: (aPoser) => {
        for (const c of aPoser) bocal.set(c.name, c.value, (c.options ?? {}) as OptionsCookie)
      },
    })
  }

  bocal.delete(COOKIE_COMPTE)
  redirect('/connexion-formateur')
}
