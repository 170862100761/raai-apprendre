import { describe, expect, it } from 'vitest'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantEvaluation } from '@/noyau/identifiants'
import {
  aVenir,
  joursDEcart,
  libelle,
  passeDevantLeProgramme,
  urgence,
  type Echeance,
} from './echeance'

const echeance = (echeanceLe: Date, extra: Partial<Echeance> = {}): Echeance => ({
  evaluationId: identifiant<IdentifiantEvaluation>('00000000-0000-4000-8000-000000000001'),
  titre: 'Réglage du semoir',
  type: 'devoir',
  chapitre: 'Semis et plantation',
  echeanceLe,
  rendue: false,
  ...extra,
})

/** Un mardi, en fin de journée : l'heure tardive est le piège à éviter. */
const MARDI_23H = new Date(2026, 8, 15, 23, 30)

describe('joursDEcart', () => {
  it('compte en jours calendaires, pas en tranches de 24 h', () => {
    // Même date cible, deux heures d'observation : « demain » reste demain.
    const demainMatin = new Date(2026, 8, 16, 8, 0)
    expect(joursDEcart(MARDI_23H, demainMatin)).toBe(1)
    expect(joursDEcart(new Date(2026, 8, 15, 7, 0), demainMatin)).toBe(1)
  })

  it('rend zéro dans la même journée, quelle que soit l’heure', () => {
    expect(joursDEcart(new Date(2026, 8, 15, 7, 0), new Date(2026, 8, 15, 22, 0))).toBe(0)
  })

  it('rend un nombre négatif pour une date passée', () => {
    expect(joursDEcart(MARDI_23H, new Date(2026, 8, 12, 8, 0))).toBe(-3)
  })

  it('franchit les mois et les années sans se tromper', () => {
    expect(joursDEcart(new Date(2026, 11, 30, 10, 0), new Date(2027, 0, 2, 9, 0))).toBe(3)
  })

  it('reste juste au passage à l’heure d’hiver', () => {
    // Le dimanche de bascule dure 25 h. Un calcul en millisecondes divisé par
    // 86 400 000 rendrait 1,04 jour — arrondi, cela tient, mais c'est bien
    // l'arrondi qui le sauve, et ce test le fige.
    expect(joursDEcart(new Date(2026, 9, 24, 12, 0), new Date(2026, 9, 25, 12, 0))).toBe(1)
  })
})

describe('urgence', () => {
  it('distingue les quatre paliers proches', () => {
    expect(urgence(echeance(new Date(2026, 8, 14, 8, 0)), MARDI_23H)).toBe('depassee')
    expect(urgence(echeance(new Date(2026, 8, 15, 8, 0)), MARDI_23H)).toBe('aujourdhui')
    expect(urgence(echeance(new Date(2026, 8, 16, 8, 0)), MARDI_23H)).toBe('demain')
    expect(urgence(echeance(new Date(2026, 8, 18, 8, 0)), MARDI_23H)).toBe('cette_semaine')
  })

  it('range au-delà de sept jours dans « plus tard »', () => {
    // La bascule exacte : J+7 presse encore, J+8 non.
    expect(urgence(echeance(new Date(2026, 8, 22, 8, 0)), MARDI_23H)).toBe('cette_semaine')
    expect(urgence(echeance(new Date(2026, 8, 23, 8, 0)), MARDI_23H)).toBe('plus_tard')
  })

  it('ne considère pas comme dépassée une échéance du jour dont l’heure est passée', () => {
    // Rendre à 8 h ce matin et regarder à 23 h : la journée n'est pas finie,
    // et annoncer « en retard » ferait paniquer pour rien.
    expect(urgence(echeance(new Date(2026, 8, 15, 8, 0)), MARDI_23H)).toBe('aujourdhui')
  })
})

describe('libelle', () => {
  it('parle en jours, jamais en date brute', () => {
    expect(libelle(echeance(new Date(2026, 8, 15, 8, 0)), MARDI_23H)).toBe("à rendre aujourd'hui")
    expect(libelle(echeance(new Date(2026, 8, 16, 8, 0)), MARDI_23H)).toBe('à rendre demain')
    expect(libelle(echeance(new Date(2026, 8, 18, 8, 0)), MARDI_23H)).toBe('à rendre dans 3 jours')
  })

  it('nomme le retard sans compter les jours quand il date de la veille', () => {
    expect(libelle(echeance(new Date(2026, 8, 14, 8, 0)), MARDI_23H)).toBe('en retard depuis hier')
    expect(libelle(echeance(new Date(2026, 8, 12, 8, 0)), MARDI_23H)).toBe('en retard de 3 jours')
  })
})

describe('aVenir', () => {
  const rendue = echeance(new Date(2026, 8, 16, 8, 0), { rendue: true })
  const demain = echeance(new Date(2026, 8, 16, 8, 0))
  const enRetard = echeance(new Date(2026, 8, 10, 8, 0))
  const dansTroisSemaines = echeance(new Date(2026, 9, 6, 8, 0))

  it('trie du plus pressant au moins pressant', () => {
    const liste = aVenir([demain, enRetard], MARDI_23H)
    expect(liste.map((e) => e.echeanceLe)).toEqual([enRetard.echeanceLe, demain.echeanceLe])
  })

  it('sort ce qui est rendu', () => {
    // Une pile qui ne se vide jamais cesse d'être lue.
    expect(aVenir([rendue], MARDI_23H)).toEqual([])
  })

  it('garde le retard, qui est justement ce qu’on risque d’oublier', () => {
    expect(aVenir([enRetard], MARDI_23H)).toHaveLength(1)
  })

  it('écarte ce qui ne presse pas encore', () => {
    expect(aVenir([dansTroisSemaines], MARDI_23H)).toEqual([])
  })

  it('ne modifie pas le tableau reçu', () => {
    const entree = [demain, enRetard]
    aVenir(entree, MARDI_23H)
    expect(entree[0]).toBe(demain)
  })
})

describe('passeDevantLeProgramme', () => {
  it('cède la main quand rien ne presse', () => {
    expect(passeDevantLeProgramme(echeance(new Date(2026, 9, 6, 8, 0)), MARDI_23H)).toBe(false)
  })

  it('passe devant pour un devoir de demain', () => {
    expect(passeDevantLeProgramme(echeance(new Date(2026, 8, 16, 8, 0)), MARDI_23H)).toBe(true)
  })

  it('passe devant à plus forte raison quand c’est en retard', () => {
    expect(passeDevantLeProgramme(echeance(new Date(2026, 8, 10, 8, 0)), MARDI_23H)).toBe(true)
  })

  it('s’efface dès que la copie est rendue, même en retard', () => {
    const copieRendue = echeance(new Date(2026, 8, 10, 8, 0), { rendue: true })
    expect(passeDevantLeProgramme(copieRendue, MARDI_23H)).toBe(false)
  })
})
