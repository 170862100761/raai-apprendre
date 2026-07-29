/**
 * Les échéances telles que l'élève les voit.
 *
 * Une échéance n'est pas une fermeture : rien n'empêche de rendre après la
 * date. Elle sert à ordonner — « qu'est-ce qui presse ? » — et sanctionner un
 * retard reste une décision d'enseignant, pas un effet de bord du logiciel.
 *
 * Tout est pur et prend `maintenant` en paramètre : une règle qui lit l'horloge
 * ne se teste pas, et celle-ci change de réponse chaque jour à minuit.
 */
import type { IdentifiantEvaluation } from '@/noyau/identifiants'

export type TypeEvaluation = 'exercice' | 'quiz' | 'devoir' | 'tp' | 'ccf' | 'examen'

export type Echeance = {
  readonly evaluationId: IdentifiantEvaluation
  readonly titre: string
  readonly type: TypeEvaluation
  readonly chapitre: string
  readonly echeanceLe: Date
  /** Une tentative soumise existe. Le retard ne se calcule plus. */
  readonly rendue: boolean
}

/**
 * Jours calendaires qui séparent deux instants — pas des tranches de 24 h.
 *
 * « Demain 8 h » est demain, qu'on le regarde ce soir à 23 h ou ce matin à 7 h.
 * Compter en heures écoulées répondrait « dans 9 h » puis « dans 25 h » pour la
 * même date, ce qui n'est pas ce qu'un élève entend par « demain ».
 */
export function joursDEcart(depuis: Date, jusqu: Date): number {
  const minuit = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((minuit(jusqu) - minuit(depuis)) / 86_400_000)
}

export type Urgence = 'depassee' | 'aujourdhui' | 'demain' | 'cette_semaine' | 'plus_tard'

export function urgence(echeance: Echeance, maintenant: Date): Urgence {
  const jours = joursDEcart(maintenant, echeance.echeanceLe)

  if (jours < 0) return 'depassee'
  if (jours === 0) return 'aujourdhui'
  if (jours === 1) return 'demain'
  return jours <= JOURS_DE_LA_SEMAINE ? 'cette_semaine' : 'plus_tard'
}

/**
 * Une semaine glissante, pas la semaine civile.
 *
 * Un devoir dû lundi disparaîtrait du tableau de bord le dimanche soir si on
 * comptait en semaines civiles — précisément le moment où l'élève le prépare.
 */
export const JOURS_DE_LA_SEMAINE = 7

/**
 * Formulation destinée à l'élève.
 *
 * Jamais de date brute seule : « 12/09 » demande un calcul mental, « dans
 * 3 jours » se lit. La date exacte accompagne le libellé dans l'interface,
 * pour lever l'ambiguïté.
 */
export function libelle(echeance: Echeance, maintenant: Date): string {
  const jours = joursDEcart(maintenant, echeance.echeanceLe)

  if (jours < -1) return `en retard de ${-jours} jours`
  if (jours === -1) return 'en retard depuis hier'
  if (jours === 0) return "à rendre aujourd'hui"
  if (jours === 1) return 'à rendre demain'
  return `à rendre dans ${jours} jours`
}

/**
 * Ce qu'il reste à faire, du plus pressant au moins pressant.
 *
 * Ce qui est rendu sort de la liste : le tableau de bord répond à « qu'est-ce
 * que je fais maintenant ? », et une pile qui ne se vide jamais cesse d'être
 * lue. L'historique des rendus vit ailleurs.
 */
export function aVenir(
  echeances: readonly Echeance[],
  maintenant: Date,
): readonly Echeance[] {
  return echeances
    .filter((e) => !e.rendue)
    .filter((e) => urgence(e, maintenant) !== 'plus_tard')
    .sort((a, b) => a.echeanceLe.getTime() - b.echeanceLe.getTime())
}

/** Trois maximum à l'écran, le reste derrière « tout voir » (doc 05 §1). */
export const ECHEANCES_AFFICHEES = 3

/**
 * Une échéance doit-elle passer devant la leçon suivante ?
 *
 * La règle du MVP, énoncée au document 05 : échéance la plus proche d'abord,
 * puis progression dans le programme. Un élève qui a un devoir pour demain n'a
 * pas besoin qu'on lui propose le chapitre 4.
 *
 * Le seuil est celui de la semaine : au-delà, rien ne presse et le programme
 * reprend la main. Une échéance dépassée passe devant à plus forte raison —
 * c'est le seul endroit où l'élève apprendra qu'il a oublié quelque chose.
 */
export function passeDevantLeProgramme(echeance: Echeance, maintenant: Date): boolean {
  if (echeance.rendue) return false
  return urgence(echeance, maintenant) !== 'plus_tard'
}
