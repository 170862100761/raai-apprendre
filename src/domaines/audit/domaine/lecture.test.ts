import { describe, expect, it } from 'vitest'
import type { ActionAuditee } from './evenement'
import { aSignaler, libelle, libelleRole, parJournee, type LigneJournal } from './lecture'

const ligne = (action: ActionAuditee, quand: string): LigneJournal => ({
  action,
  ressourceType: 'lecon',
  roleEffectif: 'enseignant',
  survenuLe: new Date(quand),
})

/** Recopiée depuis `evenement.ts` : le test doit échouer si une action est
 *  ajoutée là-bas sans libellé ici, pas suivre silencieusement. */
const TOUTES: readonly ActionAuditee[] = [
  'connexion.reussie',
  'connexion.echouee',
  'connexion.verrouillage',
  'deconnexion',
  'apprenant.cree',
  'apprenant.acces_remis',
  'classe.creee',
  'membre.modifie',
  'copie.rendue',
  'note.modifiee',
  'competence.declaree',
  'lecon.publiee',
  'lecon.depubliee',
  'ressource.deposee',
  'export.produit',
  'donnees.consultees',
  'session.impersonnee',
]

describe('libellés du journal', () => {
  it('donne un libellé lisible à chaque action', () => {
    for (const action of TOUTES) {
      expect(libelle(action), action).toBeTruthy()
      // Un libellé qui recopie le code technique ne rend service à personne.
      expect(libelle(action), action).not.toBe(action)
    }
  })

  // Pas de contrôle par `contientDonneePersonnelle` ici : ce garde-fou inspecte
  // des NOMS DE CHAMPS, pas de la prose. Appliqué à une phrase française il
  // rejette « Connexion au nom d'un autre compte » — le mot « nom » suffit.
  // Un test qui force à mal écrire l'interface pour rester vert est un test à
  // retirer, pas un libellé à contourner.

  it('traduit les rôles connus et laisse passer les inconnus', () => {
    expect(libelleRole('admin_etablissement')).toBe('Direction')
    expect(libelleRole('role_futur')).toBe('role_futur')
  })
})

describe('actions à signaler', () => {
  it('signale ce qu’un établissement doit pouvoir justifier', () => {
    expect(aSignaler('note.modifiee')).toBe(true)
    expect(aSignaler('membre.modifie')).toBe(true)
    expect(aSignaler('session.impersonnee')).toBe(true)
  })

  it('ne signale pas les actions courantes', () => {
    expect(aSignaler('connexion.reussie')).toBe(false)
    expect(aSignaler('lecon.publiee')).toBe(false)
  })
})

describe('regroupement par journée', () => {
  it('rassemble les lignes d’un même jour', () => {
    const journees = parJournee([
      ligne('note.modifiee', '2026-03-12T14:30:00Z'),
      ligne('lecon.publiee', '2026-03-12T09:05:00Z'),
      ligne('connexion.reussie', '2026-03-11T08:00:00Z'),
    ])

    expect(journees).toHaveLength(2)
    expect(journees[0]?.jour).toBe('2026-03-12')
    expect(journees[0]?.lignes).toHaveLength(2)
    expect(journees[1]?.lignes).toHaveLength(1)
  })

  it('conserve l’ordre reçu, du plus récent au plus ancien', () => {
    const journees = parJournee([
      ligne('note.modifiee', '2026-03-12T14:30:00Z'),
      ligne('lecon.publiee', '2026-03-12T09:05:00Z'),
    ])

    expect(journees[0]?.lignes[0]?.action).toBe('note.modifiee')
    expect(journees[0]?.lignes[1]?.action).toBe('lecon.publiee')
  })

  it('ne fusionne pas deux jours séparés par un retour au même jour', () => {
    // Le regroupement suit l'ordre reçu : il ne réordonne rien. Si la base
    // renvoyait des lignes désordonnées, deux blocs du même jour vaudraient
    // mieux qu'une fusion qui masquerait le désordre.
    const journees = parJournee([
      ligne('note.modifiee', '2026-03-12T14:30:00Z'),
      ligne('lecon.publiee', '2026-03-11T09:05:00Z'),
      ligne('connexion.reussie', '2026-03-12T08:00:00Z'),
    ])

    expect(journees.map((j) => j.jour)).toEqual(['2026-03-12', '2026-03-11', '2026-03-12'])
  })

  it('rend une liste vide sur une entrée vide', () => {
    expect(parJournee([])).toEqual([])
  })
})
