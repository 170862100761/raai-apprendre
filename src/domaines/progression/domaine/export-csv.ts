/**
 * Mise en forme CSV de la grille.
 *
 * Pure, donc testable — et il y a de quoi tester : trois pièges qu'on découvre
 * toujours après avoir envoyé le fichier à un établissement.
 *
 * 1. **Le séparateur.** Excel en français attend un point-virgule. Avec une
 *    virgule, tout atterrit dans la colonne A.
 * 2. **La BOM UTF-8.** Sans elle, « Maîtrisée » s'affiche « MaÃ®trisÃ©e ».
 * 3. **L'injection de formule.** Un intitulé commençant par `=` s'exécute à
 *    l'ouverture. Ce n'est pas théorique : les référentiels contiennent des
 *    formules et des signes.
 */
import type { NiveauAcquisition } from './acquisition'
import { niveauDe, type Grille } from './suivi'

export const LIBELLES_NIVEAU: Record<NiveauAcquisition, string> = {
  non_abordee: 'Non abordée',
  en_cours: 'En cours',
  acquise: 'Acquise',
  maitrisee: 'Maîtrisée',
}

export const BOM = '﻿'

/** Une cellule ne peut ni casser la structure ni déclencher un calcul. */
export function echapperCellule(valeur: string): string {
  const sur = /^[=+\-@\t\r]/.test(valeur) ? `'${valeur}` : valeur
  return `"${sur.replace(/"/g, '""')}"`
}

export function grilleEnCsv(
  grille: Grille,
  index: ReadonlyMap<string, NiveauAcquisition>,
): string {
  const lignes = [
    ['Élève', ...grille.competences.map((c) => `${c.code} ${c.intitule}`)],
    ...grille.apprenants.map((apprenant) => [
      `${apprenant.prenom} ${apprenant.initialeNom}.`,
      ...grille.competences.map(
        (competence) => LIBELLES_NIVEAU[niveauDe(index, apprenant.id, competence.id)],
      ),
    ]),
  ]

  // CRLF : c'est ce qu'attend Excel sous Windows, et c'est le parc réel.
  return BOM + lignes.map((ligne) => ligne.map(echapperCellule).join(';')).join('\r\n')
}

/** Nom de fichier sans accent ni espace : il traverse des en-têtes HTTP. */
export const nomFichierSur = (nom: string): string =>
  nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9-]/g, '-')
    .replace(/-{2,}/g, '-')
    .toLowerCase()
