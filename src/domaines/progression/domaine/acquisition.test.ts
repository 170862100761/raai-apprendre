import { describe, expect, it } from 'vitest'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantCompetence } from '@/noyau/identifiants'
import {
  declarer,
  evaluerAcquisition,
  repartir,
  SEUIL_ACQUISE,
  type AcquisExistant,
} from './acquisition'

const C5 = identifiant<IdentifiantCompetence>('C5')
const LUNDI = new Date('2026-09-14T10:00:00Z')
const HUIT_JOURS_APRES = new Date('2026-09-22T10:00:00Z')
const LENDEMAIN = new Date('2026-09-15T10:00:00Z')

const constat = (part: number, survenuLe = LUNDI) => ({
  competenceId: C5,
  part,
  survenuLe,
})

const existant = (niveau: AcquisExistant['niveau'], constateLe = LUNDI): AcquisExistant => ({
  niveau,
  constateLe,
})

describe('premier constat', () => {
  it('valide au-dessus du seuil', () => {
    const e = evaluerAcquisition(constat(SEUIL_ACQUISE), null)
    expect(e.niveau).toBe('acquise')
    expect(e.modifie).toBe(true)
  })

  it("met « en cours » en dessous du seuil, jamais « ratée »", () => {
    // Une compétence ne se rate pas : elle n'est pas encore acquise.
    expect(evaluerAcquisition(constat(0.4), null).niveau).toBe('en_cours')
    expect(evaluerAcquisition(constat(0), null).niveau).toBe('en_cours')
  })

  it('ne donne jamais la maîtrise sur un seul constat', () => {
    // Une réussite unique peut être un coup de chance.
    expect(evaluerAcquisition(constat(1), null).niveau).toBe('acquise')
  })
})

describe('un acquis ne se dégrade pas', () => {
  it("un quiz raté ne fait pas perdre une compétence acquise", () => {
    // La règle qui rend le suivi non anxiogène : sans elle, les élèves
    // cessent de tenter.
    const e = evaluerAcquisition(constat(0.1), existant('acquise'))
    expect(e.niveau).toBe('acquise')
    expect(e.modifie).toBe(false)
  })

  it("ni une compétence maîtrisée", () => {
    const e = evaluerAcquisition(constat(0, LENDEMAIN), existant('maitrisee'))
    expect(e.niveau).toBe('maitrisee')
    expect(e.modifie).toBe(false)
  })

  it('mais une réussite fait monter', () => {
    const e = evaluerAcquisition(constat(0.9), existant('en_cours'))
    expect(e.niveau).toBe('acquise')
    expect(e.modifie).toBe(true)
  })
})

describe('maîtrise', () => {
  it('demande deux validations espacées d’au moins une semaine', () => {
    const trop_tot = evaluerAcquisition(constat(1, LENDEMAIN), existant('acquise'))
    expect(trop_tot.niveau).toBe('acquise')

    const assez_tard = evaluerAcquisition(constat(1, HUIT_JOURS_APRES), existant('acquise'))
    expect(assez_tard.niveau).toBe('maitrisee')
  })

  it("ne s'atteint pas depuis « en cours », même longtemps après", () => {
    const e = evaluerAcquisition(constat(1, HUIT_JOURS_APRES), existant('en_cours'))
    expect(e.niveau).toBe('acquise')
  })

  it("ne s'atteint pas avec un mauvais résultat", () => {
    const e = evaluerAcquisition(constat(0.2, HUIT_JOURS_APRES), existant('acquise'))
    expect(e.niveau).toBe('acquise')
  })
})

describe('déclaration d’un enseignant', () => {
  it('peut dégrader — seule voie possible', () => {
    const e = declarer(C5, 'en_cours', existant('acquise'))
    expect(e.niveau).toBe('en_cours')
    expect(e.origine).toBe('declaration_enseignant')
    expect(e.modifie).toBe(true)
  })

  it('ne signale rien quand le niveau ne change pas', () => {
    expect(declarer(C5, 'acquise', existant('acquise')).modifie).toBe(false)
  })
})

describe('répartition sur les compétences', () => {
  const C6 = identifiant<IdentifiantCompetence>('C6')

  it('donne la même part à toutes les compétences visées', () => {
    const constats = repartir([C5, C6], 8, 10, LUNDI)
    expect(constats).toHaveLength(2)
    expect(constats.every((c) => c.part === 0.8)).toBe(true)
  })

  it('ne divise pas par zéro sur une évaluation sans barème', () => {
    expect(repartir([C5], 0, 0, LUNDI)[0]?.part).toBe(0)
  })

  it('ne produit rien sans compétence rattachée', () => {
    // C'est le cas d'une évaluation mal rattachée : elle ne compte nulle part,
    // et c'est signalé ailleurs plutôt que compensé ici.
    expect(repartir([], 10, 10, LUNDI)).toEqual([])
  })
})
