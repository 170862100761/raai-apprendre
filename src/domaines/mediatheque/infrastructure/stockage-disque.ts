import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { dirname, join, normalize, sep } from 'node:path'
import type { StockageObjet } from '../ports/stockage'

/**
 * Stockage sur disque — TRANSITOIRE, comme la connexion adulte.
 *
 * Supabase Storage n'est pas ouvert, et une médiathèque sans stockage ne sert à
 * rien. Le jour où le compte existe, seul ce fichier est remplacé : le port ne
 * bouge pas, ni les cas d'usage, ni les écrans.
 *
 * En production sur Vercel, le disque est éphémère et non partagé entre
 * instances : cet adaptateur n'y a rien à faire. C'est écrit ici pour que
 * personne ne le déploie par inadvertance.
 */

const RACINE = join(process.cwd(), 'outils', 'medias-locaux')

/**
 * Le chemin vient de `televerser`, qui le construit à partir d'UUID — mais on
 * ne fait pas confiance à un appelant pour une écriture disque. Un `..` qui
 * passe ici écrirait n'importe où sur la machine.
 */
function cheminSur(chemin: string): string {
  const complet = normalize(join(RACINE, chemin))
  if (!complet.startsWith(RACINE + sep)) {
    throw new Error(`Chemin de stockage hors racine : ${chemin}`)
  }
  return complet
}

export const stockageDisque: StockageObjet = {
  async ecrire(chemin, contenu) {
    const destination = cheminSur(chemin)
    await mkdir(dirname(destination), { recursive: true })
    await writeFile(destination, contenu)
  },

  async lire(chemin) {
    try {
      const fichier = await readFile(cheminSur(chemin))
      return new Uint8Array(fichier)
    } catch {
      // Fichier absent : c'est un cas nominal (ressource supprimée, base
      // restaurée sans le stockage), pas une panne.
      return null
    }
  },

  async supprimer(chemin) {
    try {
      await unlink(cheminSur(chemin))
    } catch {
      // Supprimer ce qui n'existe pas est un succès.
    }
  },
}
