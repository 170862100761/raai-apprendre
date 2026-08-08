import type { MaillageTessele } from './glb'

/**
 * La politique de pré-tessellation.
 *
 * Le STEP n'est pas lu dans le navigateur : sa tessellation est un travail
 * serveur (doc 02 §5). Charger OpenCascade — 7,6 Mo de WebAssembly — sur un
 * Chromebook de MFR reviendrait à promettre ce qu'on ne peut pas tenir. Le
 * serveur produit donc, au dépôt du fichier, un GLB allégé ; c'est lui que la
 * visionneuse affiche, et le STEP reste téléchargeable tel quel pour qui veut
 * l'ouvrir dans son logiciel de CAO.
 *
 * Ce module ne contient que des décisions, aucune E/S : ce qui a besoin d'un
 * aperçu, ce qu'un aperçu a le droit de peser, et comment on l'allège quand il
 * dépasse. Le calcul lui-même appartient à l'infrastructure.
 */

/** Formats dont l'affichage passe obligatoirement par un aperçu converti. */
const MIMES_A_CONVERTIR: readonly string[] = ['model/step']

export function aBesoinDApercu3d(typeMime: string): boolean {
  return MIMES_A_CONVERTIR.includes(typeMime)
}

/**
 * Plafond de triangles pour un aperçu.
 *
 * 300 000 triangles font environ 12 Mo de GLB non compressé, soit à peu près
 * deux fois le budget « médias par leçon » du doc 02 §6 — c'est déjà large.
 * Au-delà, ce n'est plus l'affichage qui échoue mais la tablette qui rend la
 * main, et l'élève ne sait pas pourquoi.
 */
export const BUDGET_TRIANGLES = 300_000

/**
 * Déflexions essayées, de la plus fine à la plus grossière.
 *
 * Exprimées en fraction de la diagonale de l'encombrement : une pièce de 10 mm
 * et un tracteur de 4 m doivent donner un aperçu de finesse comparable à
 * l'écran, et un enseignant n'a pas à connaître l'échelle de son fichier.
 *
 * On commence fin et on n'allège qu'en cas de dépassement : la grande majorité
 * des pièces d'un référentiel d'agroéquipement passe du premier coup, et
 * dégrader tout le monde pour les rares assemblages complets serait un mauvais
 * échange.
 */
export const DEFLEXIONS: readonly number[] = [0.001, 0.005, 0.02, 0.05]

export function nombreDeTriangles(maillages: readonly MaillageTessele[]): number {
  return maillages.reduce((somme, maillage) => somme + maillage.indices.length / 3, 0)
}

export function tientDansLeBudget(maillages: readonly MaillageTessele[]): boolean {
  return nombreDeTriangles(maillages) <= BUDGET_TRIANGLES
}

/**
 * Chemin de stockage de l'aperçu, déduit de celui de la source.
 *
 * Dérivé et non tiré au hasard : l'aperçu doit rester retrouvable même si la
 * ligne en base a été perdue et le stockage restauré seul, sinon un nettoyage
 * laisse des orphelins que personne ne sait rattacher. Le suffixe garde le
 * cloisonnement par établissement du chemin source, qui est ce qui rend une
 * fuite visible à l'œil nu lors d'un audit.
 */
export function cheminApercu(cheminSource: string): string {
  return `${cheminSource}.apercu.glb`
}

export const MIME_APERCU_3D = 'model/gltf-binary'
