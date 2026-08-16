'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { prisma } from '@/noyau/prisma'
import { identifiant, type IdentifiantEvaluation } from '@/noyau/identifiants'
import {
  creerEvaluation,
  depotEvaluationPrisma,
  depublierEvaluation,
  enregistrerEvaluation,
  publierEvaluation,
  type QuestionSaisie,
} from '@/domaines/evaluation'
import { peut } from '@/domaines/identite'
import { sessionCourante } from '../../_session'
import { auditer } from '../../_audit'

export type EtatEvaluation = {
  readonly message?: string
  readonly erreur?: string
  readonly alertes?: readonly string[]
  readonly champs?: Readonly<Record<string, string>>
}

const depot = () => depotEvaluationPrisma(prisma)

/** Les six étapes du document 06, comme pour les leçons. */
async function encadrer<T>(
  travail: (etablissementId: string) => Promise<T>,
): Promise<T | EtatEvaluation> {
  const session = await sessionCourante()
  if (session.sujetId === null) return { erreur: 'Session expirée. Reconnecte-toi.' }
  if (!peut(session, 'evaluation.ecrire').autorise) {
    return { erreur: 'Tu n’as pas les droits pour modifier une évaluation.' }
  }
  if (!session.etablissementId) return { erreur: 'Compte sans établissement.' }
  return travail(session.etablissementId)
}

const Creation = z.object({
  chapitreId: z.string().uuid('Choisis un chapitre.'),
  titre: z.string().min(3, 'Au moins trois caractères.'),
  type: z.enum(['quiz', 'exercice', 'devoir', 'tp']),
})

export async function creer(
  _precedent: EtatEvaluation,
  donnees: FormData,
): Promise<EtatEvaluation> {
  const entree = Creation.safeParse({
    chapitreId: donnees.get('chapitreId'),
    titre: donnees.get('titre'),
    type: donnees.get('type'),
  })
  if (!entree.success) {
    const champs: Record<string, string> = {}
    for (const probleme of entree.error.issues) {
      const champ = probleme.path[0]
      if (typeof champ === 'string' && !champs[champ]) champs[champ] = probleme.message
    }
    return { erreur: 'Vérifie ta saisie.', champs }
  }

  let destination: string | null = null

  const resultat = await encadrer(async (etablissementId) => {
    const cree = await creerEvaluation({ ...entree.data, etablissementId }, depot())
    if (!cree.ok) return { erreur: cree.erreur.message }
    destination = `/formateur/evaluations/${cree.valeur.evaluationId}`
    return {}
  })

  if (destination) {
    revalidatePath('/formateur/evaluations')
    redirect(destination)
  }
  return resultat as EtatEvaluation
}

const Enregistrement = z.object({
  evaluationId: z.string().uuid(),
  titre: z.string().min(3),
  questions: z.string(),
})

export async function enregistrer(
  _precedent: EtatEvaluation,
  donnees: FormData,
): Promise<EtatEvaluation> {
  const entree = Enregistrement.safeParse({
    evaluationId: donnees.get('evaluationId'),
    titre: donnees.get('titre'),
    questions: donnees.get('questions'),
  })
  if (!entree.success) return { erreur: 'Vérifie ta saisie.' }

  let questions: QuestionSaisie[]
  try {
    const analyse: unknown = JSON.parse(entree.data.questions)
    questions = Array.isArray(analyse) ? (analyse as QuestionSaisie[]) : []
  } catch {
    return { erreur: 'Contenu illisible. Recharge la page.' }
  }

  return (await encadrer(async (etablissementId) => {
    const resultat = await enregistrerEvaluation(
      {
        evaluationId: identifiant<IdentifiantEvaluation>(entree.data.evaluationId),
        etablissementId,
        titre: entree.data.titre,
        questions,
      },
      depot(),
    )
    if (!resultat.ok) return { erreur: resultat.erreur.message }

    revalidatePath('/formateur/evaluations')

    return resultat.valeur.questionsRefusees > 0
      ? {
          message: 'Enregistré.',
          alertes: [
            `${resultat.valeur.questionsRefusees} question(s) incomplète(s) n’ont pas été enregistrées.`,
          ],
        }
      : { message: 'Enregistré.' }
  })) as EtatEvaluation
}

export async function publier(
  _precedent: EtatEvaluation,
  donnees: FormData,
): Promise<EtatEvaluation> {
  const evaluationId = z.string().uuid().safeParse(donnees.get('evaluationId'))
  if (!evaluationId.success) return { erreur: 'Évaluation inconnue.' }

  const session = await sessionCourante()

  return (await encadrer(async (etablissementId) => {
    const resultat = await publierEvaluation(
      identifiant<IdentifiantEvaluation>(evaluationId.data),
      etablissementId,
      depot(),
    )
    if (!resultat.ok) return { erreur: resultat.erreur.message }

    revalidatePath('/formateur/evaluations')
    revalidatePath('/aujourdhui')

    // Publier, c'est proposer une note à des mineurs : on garde qui l'a fait.
    await auditer('evaluation.publiee', session, {
      type: 'evaluation',
      id: evaluationId.data,
    })

    return { message: `Publiée — ${resultat.valeur.questions} question(s).` }
  })) as EtatEvaluation
}

export async function depublier(
  _precedent: EtatEvaluation,
  donnees: FormData,
): Promise<EtatEvaluation> {
  const evaluationId = z.string().uuid().safeParse(donnees.get('evaluationId'))
  if (!evaluationId.success) return { erreur: 'Évaluation inconnue.' }

  const session = await sessionCourante()

  return (await encadrer(async (etablissementId) => {
    const resultat = await depublierEvaluation(
      identifiant<IdentifiantEvaluation>(evaluationId.data),
      etablissementId,
      depot(),
    )
    if (!resultat.ok) return { erreur: resultat.erreur.message }

    revalidatePath('/formateur/evaluations')
    revalidatePath('/aujourdhui')

    await auditer('evaluation.depubliee', session, {
      type: 'evaluation',
      id: evaluationId.data,
    })

    return { message: 'Repassée en brouillon.' }
  })) as EtatEvaluation
}
