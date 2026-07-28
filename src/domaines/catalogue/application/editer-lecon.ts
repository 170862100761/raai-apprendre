/**
 * Édition d'une leçon.
 *
 * Objectif mesuré du document 05 : un enseignant publie son premier chapitre en
 * moins de dix minutes, sans aide. Tout ici découle de cette contrainte —
 * enregistrement automatique, aucun champ obligatoire hors titre et
 * compétences, aucune étape de configuration préalable.
 */
import type { IdentifiantCompetence, IdentifiantLecon } from '@/noyau/identifiants'
import { echec, succes, type Resultat } from '@/noyau/resultat'
import { lireContenu, type ContenuBloc } from '../domaine/bloc'
import { versionSuivante } from '../domaine/lecon'
import type { DepotCatalogue } from '../ports/depot-catalogue'

export type EntreeCreation = {
  readonly chapitreId: string
  readonly etablissementId: string
  readonly titre: string
  /**
   * Exigées dès la création, et c'est le point le plus important de l'écran.
   * Placé en fin de parcours, le rattachement au référentiel est
   * systématiquement sauté — et sans lui, tout le suivi de compétences
   * s'effondre.
   */
  readonly competences: readonly IdentifiantCompetence[]
}

export async function creerLecon(
  entree: EntreeCreation,
  depot: DepotCatalogue,
): Promise<Resultat<{ leconId: IdentifiantLecon }>> {
  const titre = entree.titre.trim()
  if (titre.length < 3) {
    return echec('donnees_invalides', 'Donne un titre à cette leçon.', {
      titre: 'Au moins trois caractères.',
    })
  }

  if (entree.competences.length === 0) {
    return echec(
      'donnees_invalides',
      'Choisis au moins une compétence du référentiel.',
      { competences: 'Sans compétence, la leçon ne comptera dans aucune progression.' },
    )
  }

  const leconId = await depot.creerLecon({ ...entree, titre })
  return succes({ leconId })
}

export type EntreeBlocs = {
  readonly leconId: IdentifiantLecon
  readonly titre: string
  readonly competences: readonly IdentifiantCompetence[]
  /** L'éditeur envoie toujours l'état complet, jamais un différentiel. */
  readonly blocs: readonly unknown[]
}

export async function enregistrerLecon(
  entree: EntreeBlocs,
  depot: DepotCatalogue,
): Promise<Resultat<{ blocsRetenus: number; blocsRefuses: number }>> {
  const lecon = await depot.chargerLecon(entree.leconId)
  if (!lecon) return echec('introuvable', 'Leçon introuvable.')

  if (lecon.statut === 'archivee') {
    return echec('regle_metier', 'Cette leçon est archivée : elle ne se modifie plus.')
  }

  // Une leçon publiée n'est pas éditée en place : un élève qui travaille
  // dessus ne doit pas voir l'énoncé changer sous ses pieds.
  if (lecon.statut === 'publiee') {
    await depot.depublier(entree.leconId, versionSuivante(lecon))
  }

  const retenus: { contenu: ContenuBloc; genereParIa: boolean }[] = []
  let refuses = 0

  for (const brut of entree.blocs) {
    const contenu = lireContenu(brut)
    if (contenu) retenus.push({ contenu, genereParIa: false })
    else refuses++
  }

  const titre = entree.titre.trim()
  if (titre.length >= 3 && titre !== lecon.titre) {
    await depot.modifierTitre(entree.leconId, titre)
  }

  await depot.remplacerBlocs(entree.leconId, retenus)
  await depot.remplacerCompetences(entree.leconId, entree.competences)

  return succes({ blocsRetenus: retenus.length, blocsRefuses: refuses })
}
