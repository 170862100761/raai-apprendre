/**
 * Déclarations pour `occt-import-js`, qui n'en fournit pas.
 *
 * Décrit exactement ce que nous appelons, et rien de plus : la bibliothèque
 * expose aussi la lecture d'IGES et de BREP, que nous n'acceptons pas au
 * téléversement. Un type plus large inviterait à s'en servir sans passer par la
 * liste blanche de `type-fichier.ts`.
 */
declare module 'occt-import-js' {
  type TableauAttribut = { array: number[] }

  export type MaillageOcct = {
    name: string
    attributes: {
      position: TableauAttribut
      normal?: TableauAttribut
    }
    index: TableauAttribut
    /** Composantes 0–1. Absente quand le STEP ne déclare pas de couleur. */
    color?: [number, number, number]
  }

  export type ResultatLecture = {
    success: boolean
    meshes?: MaillageOcct[]
  }

  export type ParametresLecture = {
    linearDeflectionType?: 'bounding_box_ratio' | 'absolute_value'
    linearDeflection?: number
    angularDeflection?: number
  }

  export type Occt = {
    ReadStepFile(
      contenu: Uint8Array,
      parametres: ParametresLecture | null,
    ): ResultatLecture
  }

  export default function occtimportjs(options?: {
    locateFile?: (fichier: string) => string
  }): Promise<Occt>
}
