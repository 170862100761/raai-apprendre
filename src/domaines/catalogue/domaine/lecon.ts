/**
 * La leçon et son cycle de publication.
 *
 * Une leçon publiée n'est pas éditée en place : la modification crée une
 * version n+1. Un élève qui a lu la version 1 doit pouvoir retrouver ce qu'il a
 * lu, et un enseignant ne doit pas pouvoir changer un énoncé sous les pieds
 * d'une classe en train de travailler.
 */
import type { IdentifiantCompetence, IdentifiantLecon } from '@/noyau/identifiants'
import { echec, succes, type Resultat } from '@/noyau/resultat'
import { alertesAccessibilite, type Bloc } from './bloc'

export type StatutLecon = 'brouillon' | 'en_relecture' | 'publiee' | 'archivee'

export type Lecon = {
  readonly id: IdentifiantLecon
  readonly titre: string
  readonly statut: StatutLecon
  readonly version: number
  readonly dureeEstimeeMin: number
  readonly blocs: readonly Bloc[]
  readonly competences: readonly IdentifiantCompetence[]
}

/** Transitions autorisées. Ce qui n'est pas listé est refusé. */
const TRANSITIONS: Record<StatutLecon, readonly StatutLecon[]> = {
  brouillon: ['en_relecture', 'publiee', 'archivee'],
  en_relecture: ['brouillon', 'publiee'],
  // Dépublier ramène au brouillon, ce qui ouvre une nouvelle version.
  publiee: ['brouillon', 'archivee'],
  archivee: [],
}

export function peutPasserA(depuis: StatutLecon, vers: StatutLecon): boolean {
  return TRANSITIONS[depuis].includes(vers)
}

export type PublicationValidee = {
  readonly blocs: readonly Bloc[]
  readonly dureeEstimeeMin: number
  readonly alertes: readonly string[]
}

/**
 * Ce qu'une leçon doit satisfaire pour partir chez des élèves.
 *
 * Deux refus seulement, et ils sont tous les deux structurels : une leçon vide
 * n'apprend rien, et une leçon sans compétence casse tout le suivi — c'est
 * précisément ce qui arrive quand on place le rattachement au référentiel en
 * fin de parcours de création, là où il est systématiquement sauté.
 *
 * Le reste (sous-titres manquants, etc.) informe sans bloquer.
 */
export function validerPourPublication(lecon: Lecon): Resultat<PublicationValidee> {
  if (!peutPasserA(lecon.statut, 'publiee')) {
    return echec(
      'regle_metier',
      `Une leçon ${libelleStatut(lecon.statut)} ne peut pas être publiée.`,
    )
  }

  if (lecon.blocs.length === 0) {
    return echec('regle_metier', 'Cette leçon est vide : ajoute au moins un contenu.')
  }

  if (lecon.competences.length === 0) {
    return echec(
      'regle_metier',
      'Rattache cette leçon à au moins une compétence du référentiel — sans cela, ' +
        'elle ne comptera dans la progression d’aucun élève.',
    )
  }

  const genereNonRelu = lecon.blocs.filter((b) => b.genereParIa)
  if (genereNonRelu.length > 0 && lecon.statut === 'brouillon') {
    // Le passage par la relecture est le seul moment où un humain voit
    // réellement ce que la machine a écrit.
    return echec(
      'regle_metier',
      `${genereNonRelu.length} contenu(s) généré(s) par IA n’ont pas encore été validés. ` +
        `Relis-les avant de publier.`,
    )
  }

  return succes({
    blocs: lecon.blocs,
    dureeEstimeeMin: lecon.dureeEstimeeMin,
    alertes: alertesAccessibilite(lecon.blocs),
  })
}

/** Une leçon publiée qu'on rouvre repart en brouillon, sur une version neuve. */
export function versionSuivante(lecon: Lecon): number {
  return lecon.statut === 'publiee' ? lecon.version + 1 : lecon.version
}

function libelleStatut(statut: StatutLecon): string {
  switch (statut) {
    case 'brouillon':
      return 'en brouillon'
    case 'en_relecture':
      return 'en relecture'
    case 'publiee':
      return 'déjà publiée'
    case 'archivee':
      return 'archivée'
  }
}

/**
 * Choix de l'action prioritaire du tableau de bord élève.
 *
 * Règle simple et assumée pour le MVP : la leçon la moins avancée, dans
 * l'ordre du programme. L'IA prendra le relais en V1 — mais une règle lisible
 * qu'un enseignant peut expliquer à un élève vaut mieux qu'un classement opaque
 * qu'on ne sait pas justifier.
 */
export type LeconDuParcours = {
  readonly id: IdentifiantLecon
  readonly titre: string
  readonly dureeEstimeeMin: number
  readonly ordre: number
  readonly chapitre: string
  readonly commencee: boolean
  readonly terminee: boolean
}

export function prochaineAction(
  lecons: readonly LeconDuParcours[],
): LeconDuParcours | null {
  const parOrdre = [...lecons].sort((a, b) => a.ordre - b.ordre)

  // Reprendre ce qui est commencé avant d'ouvrir un nouveau front.
  return (
    parOrdre.find((l) => l.commencee && !l.terminee) ??
    parOrdre.find((l) => !l.terminee) ??
    null
  )
}
