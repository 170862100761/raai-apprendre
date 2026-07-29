import { describe, expect, it } from 'vitest'
import {
  anonymiser,
  CHAMPS_IDENTIFIANTS,
  contientUnTiers,
  MENTION_ANONYME,
  resteIdentifiable,
  type ApprenantIdentifiable,
  type DossierRgpd,
} from './dossier-rgpd'

const LEA: ApprenantIdentifiable = {
  id: '00000000-0000-4000-8000-000000000040',
  prenom: 'Léa',
  initialeNom: 'M',
  identifiant: 'lea.escatalens',
  codeHash: '$2b$10$abcdefghijklmnopqrstuv',
  compteId: null,
  vuLe: new Date('2026-07-20T08:12:00Z'),
  actif: true,
}

const DOSSIER: DossierRgpd = {
  version: 1,
  genereLe: '2026-07-29T13:10:00.000Z',
  etablissement: 'MFR Escatalens',
  eleve: {
    prenom: 'Léa',
    initialeNom: 'M',
    identifiant: 'lea.escatalens',
    inscritLe: '2026-09-01',
  },
  classes: ['TAE 2026'],
  acquis: [
    {
      competence: 'C5',
      intitule: 'Choisir un équipement adapté',
      niveau: 'acquise',
      constateLe: '2026-07-12',
    },
  ],
  evaluations: [
    {
      evaluation: 'Débit et pression : les bases',
      statut: 'corrigee_auto',
      score: 9,
      scoreMax: 9,
      soumiseLe: '2026-07-12T10:00:00.000Z',
    },
  ],
  lectures: [{ lecon: 'Débit, pression et puissance hydraulique', termineeLe: '2026-07-11' }],
}

describe('anonymisation', () => {
  it('efface tous les champs identifiants déclarés', () => {
    const anonyme = anonymiser()

    // La liste est parcourue, pas recopiée : ajouter une colonne personnelle
    // au schéma sans la traiter ici fait échouer ce test.
    for (const champ of CHAMPS_IDENTIFIANTS) {
      const valeur = (anonyme as Record<string, unknown>)[champ]
      if (champ === 'prenom') {
        expect(valeur).toBe(MENTION_ANONYME)
        continue
      }
      expect(valeur === null || valeur === '').toBe(true)
    }
  })

  it('ne laisse pas un prénom vide, qui passerait pour un bogue', () => {
    // « Élève retiré » se lit et ne désigne personne ; « » fait croire à un
    // affichage cassé et pousse quelqu'un à « réparer » la donnée.
    expect(anonymiser().prenom).not.toBe('')
    expect(anonymiser().prenom).toBe(MENTION_ANONYME)
  })

  it('désactive le compte plutôt que de le laisser ouvert', () => {
    expect(anonymiser().actif).toBe(false)
  })

  it('reconnaît un élève encore identifiable', () => {
    expect(resteIdentifiable(LEA)).toBe(true)
  })

  it('constate qu’un élève anonymisé ne l’est plus', () => {
    expect(resteIdentifiable(anonymiser())).toBe(false)
  })

  it('repère une anonymisation à moitié appliquée', () => {
    // Le cas réel : la mise à jour passe sur le prénom mais l'identifiant de
    // connexion survit. On croit le dossier clos, l'élève reste retrouvable.
    const bancal = { ...anonymiser(), identifiant: 'lea.escatalens' }
    expect(resteIdentifiable(bancal)).toBe(true)
  })
})

describe('portabilité', () => {
  it('ne contient aucun camarade', () => {
    expect(contientUnTiers(DOSSIER, ['Thomas', 'Inès'])).toBe(false)
  })

  it('détecte un camarade qui aurait fuité par une jointure', () => {
    // Le défaut classique : on exporte « la classe » au lieu de « l'élève »,
    // et vingt-neuf camarades partent avec.
    const fuite: DossierRgpd = {
      ...DOSSIER,
      classes: ['TAE 2026 — Léa M., Thomas B., Inès K.'],
    }
    expect(contientUnTiers(fuite, ['Thomas', 'Inès'])).toBe(true)
  })

  it('ignore les prénoms trop courts pour être discriminants', () => {
    // « Al » se retrouve dans n'importe quel mot ; le signaler noierait les
    // vraies fuites sous des fausses.
    expect(contientUnTiers(DOSSIER, ['Al'])).toBe(false)
  })

  it('ne se laisse pas berner par la casse', () => {
    expect(contientUnTiers({ ...DOSSIER, classes: ['THOMAS B.'] }, ['Thomas'])).toBe(true)
  })

  it('porte une date et une version', () => {
    // Un export sans date ne prouve rien six mois plus tard, et
    // l'établissement doit pouvoir dire ce qu'il a remis, et quand.
    expect(DOSSIER.version).toBe(1)
    expect(() => new Date(DOSSIER.genereLe).toISOString()).not.toThrow()
  })
})
