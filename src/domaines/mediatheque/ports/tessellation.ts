import type { MaillageTessele } from '../domaine/glb'

/**
 * La tessellation, vue du domaine.
 *
 * Derrière ce port il y a OpenCascade compilé en WebAssembly, 7,6 Mo chargés
 * dans le processus serveur. Le domaine n'en sait rien : il demande des
 * triangles et reçoit des triangles. C'est ce qui permet de tester la politique
 * d'aperçu — budget, dégradation, écriture du GLB — sans jamais démarrer un
 * moteur de CAO.
 */
export interface TessellateurStep {
  /**
   * `null` quand le fichier n'est pas exploitable : STEP corrompu, géométrie
   * vide, version non gérée. Ce n'est pas une panne, c'est un verdict — d'où un
   * `null` plutôt qu'une exception.
   *
   * @param deflexion Fraction de la diagonale de l'encombrement (cf. `DEFLEXIONS`).
   */
  tesseller(
    contenu: Uint8Array,
    deflexion: number,
  ): Promise<readonly MaillageTessele[] | null>
}
