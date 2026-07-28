import type { IdentifiantClasse, IdentifiantEtablissement } from '@/noyau/identifiants'
import { echec, succes, type Resultat } from '@/noyau/resultat'
import type { Hachage } from '@/domaines/identite'
import {
  analyserImport,
  codeDeRattachement,
  identifiantDeConnexion,
  type LigneRejetee,
} from '../domaine/inscription'
import type {
  AccesEleve,
  ClasseCreee,
  DepotOrganisation,
} from '../ports/depot-organisation'

export type Dependances = {
  readonly depot: DepotOrganisation
  readonly hachage: Hachage
  /** Injecté pour rendre les tests reproductibles. */
  readonly genererCode: () => string
}

export type EntreeClasse = {
  readonly etablissementId: IdentifiantEtablissement
  readonly offreId: string
  readonly niveauId: string
  readonly anneeId: string
  readonly nom: string
  readonly annee: string
}

export async function creerClasse(
  entree: EntreeClasse,
  { depot }: Pick<Dependances, 'depot'>,
): Promise<Resultat<ClasseCreee>> {
  const nom = entree.nom.trim()
  if (nom.length < 2) {
    return echec('donnees_invalides', 'Donne un nom à cette classe.', {
      nom: 'Au moins deux caractères.',
    })
  }

  const classe = await depot.creerClasse({
    etablissementId: entree.etablissementId,
    offreId: entree.offreId,
    niveauId: entree.niveauId,
    anneeId: entree.anneeId,
    nom,
    codeRattachement: codeDeRattachement(nom, entree.annee),
  })

  return succes(classe)
}

export type ResultatInscription = {
  readonly acces: readonly AccesEleve[]
  readonly rejetes: readonly LigneRejetee[]
  readonly colonnesIgnorees: number
}

/**
 * Inscrit une liste d'élèves et rend leurs accès.
 *
 * **Les codes ne sont lisibles qu'ici.** Ils sont hachés avant d'entrer en
 * base : ni l'établissement, ni nous, ni un attaquant ne peuvent les retrouver
 * ensuite. C'est ce qui rend acceptable un secret à quatre chiffres — et c'est
 * pourquoi l'écran qui les affiche doit le dire sans détour.
 */
export async function inscrireEleves(
  classeId: IdentifiantClasse,
  etablissementId: IdentifiantEtablissement,
  liste: string,
  { depot, hachage, genererCode }: Dependances,
): Promise<Resultat<ResultatInscription>> {
  const etablissement = await depot.chargerEtablissement(etablissementId)
  if (!etablissement) return echec('introuvable', 'Établissement introuvable.')

  if (!(await depot.classeExiste(classeId, etablissementId))) {
    return echec('introuvable', 'Classe introuvable.')
  }

  const analyse = analyserImport(liste)
  if (analyse.retenus.length === 0) {
    return echec(
      'donnees_invalides',
      'Aucun élève n’a pu être lu. Colle une liste avec un prénom par ligne.',
    )
  }

  const pris = new Set(await depot.identifiantsPris(etablissementId))

  const prepares = await Promise.all(
    analyse.retenus.map(async (eleve) => {
      const identifiant = identifiantDeConnexion(eleve.prenom, etablissement.uai, pris)
      // Ajouté au fur et à mesure : deux « Léa » dans la même liste doivent
      // recevoir deux identifiants distincts, pas le même deux fois.
      pris.add(identifiant)

      const code = genererCode()
      return {
        prenom: eleve.prenom,
        initialeNom: eleve.initialeNom,
        identifiant,
        code,
        codeHash: await hachage.hacher(code),
      }
    }),
  )

  const crees = await depot.inscrireEleves(
    classeId,
    etablissementId,
    prepares.map(({ prenom, initialeNom, identifiant, codeHash }) => ({
      prenom,
      initialeNom,
      identifiant,
      codeHash,
    })),
  )

  const parIdentifiant = new Map(crees.map((c) => [c.identifiant, c.id]))

  return succes({
    acces: prepares.flatMap((prepare) => {
      const apprenantId = parIdentifiant.get(prepare.identifiant)
      if (!apprenantId) return []
      return [
        {
          apprenantId,
          prenom: prepare.prenom,
          initialeNom: prepare.initialeNom,
          identifiant: prepare.identifiant,
          code: prepare.code,
        },
      ]
    }),
    rejetes: analyse.rejetes,
    colonnesIgnorees: analyse.colonnesIgnorees,
  })
}
