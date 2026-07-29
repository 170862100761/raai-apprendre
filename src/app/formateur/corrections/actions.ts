'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/noyau/prisma'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantTentative } from '@/noyau/identifiants'
import { depotEvaluationPrisma, noterCopie, type NoteEnseignant } from '@/domaines/evaluation'
import { depotProgressionPrisma, enregistrerResultat } from '@/domaines/progression'
import { peut } from '@/domaines/identite'
import { sessionCourante } from '../../_session'
import { auditer } from '../../_audit'

export type EtatCorrection = {
  readonly message?: string
  readonly erreur?: string
  /** Erreurs par question, pour les afficher au bon endroit du formulaire. */
  readonly champs?: Readonly<Record<string, string>>
}

const Note = z.object({
  questionId: z.string().uuid(),
  // Saisie libre côté navigateur : la virgule décimale française passe par ici,
  // et « 2,5 » ne doit pas devenir NaN sans qu'on le dise.
  score: z.string(),
  commentaire: z.string().max(2000),
})

/**
 * Enregistre la correction d'une copie par un enseignant.
 *
 * Les six étapes du document 06 §2, dans l'ordre : authentifier, valider,
 * autoriser, exécuter, invalider, auditer.
 */
export async function enregistrerCorrection(
  _precedent: EtatCorrection,
  donnees: FormData,
): Promise<EtatCorrection> {
  // 1. Authentifier
  const session = await sessionCourante()
  if (session.sujetId === null) return { erreur: 'Session expirée.' }

  // 2. Valider
  const tentativeBrute = donnees.get('tentativeId')
  if (typeof tentativeBrute !== 'string' || !z.string().uuid().safeParse(tentativeBrute).success) {
    return { erreur: 'Copie inconnue.' }
  }

  const questionIds = donnees.getAll('questionId').map(String)
  const champs: Record<string, string> = {}
  const notes: NoteEnseignant[] = []

  for (const questionId of questionIds) {
    const brut = Note.safeParse({
      questionId,
      score: donnees.get(`score-${questionId}`) ?? '',
      commentaire: donnees.get(`commentaire-${questionId}`) ?? '',
    })
    if (!brut.success) {
      champs[questionId] = 'Saisie invalide.'
      continue
    }

    const saisie = brut.data.score.trim()
    // Laisser une note vide est le moyen normal de corriger en plusieurs fois :
    // on saute la question, elle reste dans la pile.
    if (saisie === '') continue

    const score = Number(saisie.replace(',', '.'))
    if (!Number.isFinite(score)) {
      champs[questionId] = 'Entre un nombre, par exemple 2,5.'
      continue
    }

    notes.push({ questionId, score, commentaire: brut.data.commentaire })
  }

  if (Object.keys(champs).length > 0) return { champs, erreur: 'Corrige les notes signalées.' }
  if (notes.length === 0) return { erreur: 'Aucune note saisie.' }

  // 3. Autoriser
  const decision = peut(session, 'evaluation.corriger', {})
  if (!decision.autorise) return { erreur: decision.motif }
  if (!session.etablissementId) return { erreur: 'Compte sans établissement.' }

  // 4. Exécuter
  const tentativeId = identifiant<IdentifiantTentative>(tentativeBrute)
  const depot = depotEvaluationPrisma(prisma)

  // Le cloisonnement est déjà porté par la RLS ; cette lecture-ci répond à une
  // autre question — la copie appartient-elle bien à l'établissement de la
  // session ? Un identifiant deviné ne doit pas ouvrir la copie d'un autre.
  const copie = await depot.chargerPourCorrection(tentativeId)
  if (!copie || copie.etablissementId !== session.etablissementId) {
    return { erreur: 'Copie introuvable.' }
  }

  const resultat = await noterCopie(tentativeId, notes, depot)
  if (!resultat.ok) {
    // `champs` est absent quand l'erreur ne vise aucune question en
    // particulier ; le poser à `undefined` violerait le typage strict.
    const { message, champs: parQuestion } = resultat.erreur
    return parQuestion ? { erreur: message, champs: parQuestion } : { erreur: message }
  }

  // La progression ne bouge qu'une fois la copie close : noter une question sur
  // quatre ne dit rien de la compétence. `evaluation` ignore ce qu'est un
  // acquis — c'est ici, dans la présentation, que les deux modules se croisent.
  if (resultat.valeur.close) {
    const evaluation = await depot.chargerPourEleve(copie.evaluationId)
    if (evaluation && evaluation.competences.length > 0) {
      await enregistrerResultat(
        {
          apprenantId: copie.apprenantId,
          etablissementId: session.etablissementId,
          competences: evaluation.competences,
          score: resultat.valeur.score,
          scoreMax: resultat.valeur.scoreMax,
          sourceId: copie.evaluationId,
          survenuLe: new Date(),
        },
        depotProgressionPrisma(prisma),
      )
    }
  }

  // 5. Invalider — la pile de l'enseignant, et le tableau de bord de l'élève.
  revalidatePath('/formateur/corrections')
  revalidatePath('/aujourdhui')

  // 6. Auditer — qui a noté quoi, jamais la note elle-même : le journal ne
  //    recopie pas les données.
  await auditer('note.modifiee', session, { type: 'tentative', id: tentativeBrute })

  const { close, restantes, sansCommentaire } = resultat.valeur
  const avertissement =
    sansCommentaire.length > 0
      ? ` ${sansCommentaire.length} note${sansCommentaire.length > 1 ? 's' : ''} sans commentaire.`
      : ''

  return {
    message: close
      ? `Copie corrigée : ${resultat.valeur.score} / ${resultat.valeur.scoreMax}.${avertissement}`
      : `Enregistré. ${restantes.length} question${restantes.length > 1 ? 's' : ''} restante${restantes.length > 1 ? 's' : ''}.${avertissement}`,
  }
}
