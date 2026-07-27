/**
 * Le domaine est pur : ces tests ne touchent ni base ni réseau. Ils décrivent
 * les garanties qu'on donne aux établissements, aux enseignants et aux familles.
 */
import { describe, expect, it } from 'vitest'
import { identifiant } from '@/noyau/identifiants'
import type {
  IdentifiantApprenant,
  IdentifiantClasse,
  IdentifiantCompte,
  IdentifiantEtablissement,
} from '@/noyau/identifiants'
import { peut, autorise } from './droits'
import { SESSION_ANONYME, type Attribution, type Session } from './session'

const ETAB_A = identifiant<IdentifiantEtablissement>('etab-a')
const ETAB_B = identifiant<IdentifiantEtablissement>('etab-b')
const CLASSE_1 = identifiant<IdentifiantClasse>('classe-1')
const CLASSE_2 = identifiant<IdentifiantClasse>('classe-2')

function session(
  attributions: Attribution[],
  options: Partial<Session> = {},
): Session {
  return {
    sujetId: identifiant<IdentifiantCompte>('sujet'),
    attributions,
    etablissementId: ETAB_A,
    classes: [],
    origine: 'compte',
    ...options,
  }
}

const enseignant = (classes: IdentifiantClasse[] = [CLASSE_1]) =>
  session([{ role: 'enseignant', portee: { type: 'etablissement', etablissementId: ETAB_A } }], {
    classes,
  })

const responsable = () =>
  session([
    { role: 'responsable_pedagogique', portee: { type: 'etablissement', etablissementId: ETAB_A } },
  ])

const adminNational = () =>
  session([{ role: 'admin_national', portee: { type: 'nationale' } }], {
    etablissementId: null,
  })

const apprenant = (id = 'sujet') =>
  session([{ role: 'apprenant', portee: { type: 'soi' } }], {
    sujetId: identifiant<IdentifiantApprenant>(id),
    origine: 'jeton_apprenant',
  })

describe('session absente', () => {
  it('ne peut rien, pas même lire une leçon', () => {
    expect(autorise(SESSION_ANONYME, 'lecon.lire')).toBe(false)
    expect(peut(SESSION_ANONYME, 'lecon.lire').autorise).toBe(false)
  })
})

describe('cloisonnement entre établissements', () => {
  it("un enseignant de A ne fait rien dans B", () => {
    const decision = peut(enseignant(), 'lecon.ecrire', { etablissementId: ETAB_B })
    expect(decision.autorise).toBe(false)
    expect(decision.autorise === false && decision.motif).toMatch(/périmètre/)
  })

  it('il agit normalement dans son propre établissement', () => {
    expect(autorise(enseignant(), 'lecon.ecrire', { etablissementId: ETAB_A })).toBe(true)
  })

  it("une portée nationale traverse les établissements", () => {
    expect(autorise(adminNational(), 'referentiel.publier', { etablissementId: ETAB_B })).toBe(true)
  })
})

describe("portée « ses classes »", () => {
  it("un enseignant sans affectation n'atteint aucune classe", () => {
    const decision = peut(enseignant([]), 'progression.lire_classe', { classeId: CLASSE_1 })
    expect(decision.autorise).toBe(false)
    expect(decision.autorise === false && decision.motif).toMatch(/encadrée/)
  })

  it("il n'atteint pas une classe qui n'est pas la sienne", () => {
    expect(
      autorise(enseignant([CLASSE_1]), 'progression.lire_classe', { classeId: CLASSE_2 }),
    ).toBe(false)
  })

  it('il atteint la classe qui lui est affectée', () => {
    expect(
      autorise(enseignant([CLASSE_1]), 'progression.lire_classe', { classeId: CLASSE_1 }),
    ).toBe(true)
  })

  it("un responsable pédagogique voit toutes les classes de son établissement", () => {
    expect(autorise(responsable(), 'progression.lire_classe', { classeId: CLASSE_2 })).toBe(true)
  })
})

describe("l'administrateur national ne lit aucune donnée nominative", () => {
  it("ne peut pas lire un élève nommément", () => {
    const decision = peut(adminNational(), 'apprenant.lire_nominatif')
    expect(decision.autorise).toBe(false)
    expect(decision.autorise === false && decision.motif).toMatch(/agrégées/)
  })

  it('ne peut pas ouvrir le suivi nominatif d’une classe', () => {
    expect(autorise(adminNational(), 'progression.lire_classe', { classeId: CLASSE_1 })).toBe(false)
  })

  it('accède en revanche aux statistiques nationales', () => {
    expect(autorise(adminNational(), 'statistiques.nationales')).toBe(true)
  })

  it("l'interdiction tombe s'il est aussi enseignant quelque part", () => {
    // Cas réel : un inspecteur qui enseigne. Le cumul d'attributions doit
    // lui rendre ses droits d'enseignant, sans lui donner ceux-ci partout.
    const cumul = session(
      [
        { role: 'admin_national', portee: { type: 'nationale' } },
        { role: 'enseignant', portee: { type: 'etablissement', etablissementId: ETAB_A } },
      ],
      { classes: [CLASSE_1] },
    )
    expect(autorise(cumul, 'apprenant.lire_nominatif', { etablissementId: ETAB_A })).toBe(true)
  })
})

describe("le pilotage n'évalue pas à la place des enseignants", () => {
  it("un responsable pédagogique ne modifie pas une note", () => {
    const decision = peut(responsable(), 'note.modifier')
    expect(decision.autorise).toBe(false)
    expect(decision.autorise === false && decision.motif).toMatch(/Seul l'enseignant/)
  })

  it("il ne déclare pas une compétence", () => {
    expect(autorise(responsable(), 'competence.declarer')).toBe(false)
  })

  it("l'enseignant, lui, le fait sur ses classes", () => {
    expect(autorise(enseignant(), 'note.modifier', { classeId: CLASSE_1 })).toBe(true)
    expect(autorise(enseignant(), 'competence.declarer', { classeId: CLASSE_1 })).toBe(true)
  })
})

describe('un apprenant', () => {
  it("ne voit que ses propres données", () => {
    const lea = apprenant('lea')
    const decision = peut(lea, 'progression.lire_la_sienne', {
      apprenantId: identifiant<IdentifiantApprenant>('thomas'),
    })
    expect(decision.autorise).toBe(false)
    expect(decision.autorise === false && decision.motif).toMatch(/ses propres/)
  })

  it('voit les siennes', () => {
    const lea = apprenant('lea')
    expect(
      autorise(lea, 'progression.lire_la_sienne', {
        apprenantId: identifiant<IdentifiantApprenant>('lea'),
      }),
    ).toBe(true)
  })

  it("ne corrige pas, ne publie pas, n'exporte pas", () => {
    const lea = apprenant()
    expect(autorise(lea, 'evaluation.corriger')).toBe(false)
    expect(autorise(lea, 'lecon.publier')).toBe(false)
    expect(autorise(lea, 'export.produire')).toBe(false)
  })
})

describe('impersonation de support', () => {
  it("est interdite sur un élève mineur, quel que soit le rôle", () => {
    const decision = peut(adminNational(), 'session.impersonner', { cibleEstMineur: true })
    expect(decision.autorise).toBe(false)
    expect(decision.autorise === false && decision.motif).toMatch(/mineur/)
  })

  it('reste possible sur un compte adulte', () => {
    expect(autorise(adminNational(), 'session.impersonner', { cibleEstMineur: false })).toBe(true)
  })
})

describe('parent', () => {
  it("suit la progression mais pas les productions", () => {
    const p = session([{ role: 'parent', portee: { type: 'soi' } }])
    expect(autorise(p, 'progression.lire_la_sienne')).toBe(false) // rôle apprenant requis
    expect(autorise(p, 'evaluation.corriger')).toBe(false)
    expect(autorise(p, 'apprenant.lire_nominatif')).toBe(false)
    expect(autorise(p, 'lecon.lire', { etablissementId: ETAB_A })).toBe(true)
  })
})

describe("aucune action n'est ouverte par défaut", () => {
  it('toute action refuse une session anonyme', () => {
    const actions = Object.keys(
      // La matrice est exhaustive par construction : si une action est ajoutée
      // sans droits, ce test la met en évidence plutôt que de la laisser passer.
      {
        'lecon.lire': 1, 'lecon.ecrire': 1, 'lecon.publier': 1, 'lecon.supprimer': 1,
        'evaluation.ecrire': 1, 'evaluation.passer': 1, 'evaluation.corriger': 1,
        'note.modifier': 1, 'progression.lire_la_sienne': 1, 'progression.lire_classe': 1,
        'competence.declarer': 1, 'classe.creer': 1, 'classe.gerer': 1, 'apprenant.creer': 1,
        'apprenant.lire_nominatif': 1, 'membre.gerer': 1, 'etablissement.gerer': 1,
        'statistiques.etablissement': 1, 'statistiques.nationales': 1, 'export.produire': 1,
        'referentiel.publier': 1, 'bibliotheque.moderer': 1, 'session.impersonner': 1,
      } as const,
    ) as Parameters<typeof peut>[1][]

    for (const action of actions) {
      expect(autorise(SESSION_ANONYME, action), `action ${action}`).toBe(false)
    }
  })
})
