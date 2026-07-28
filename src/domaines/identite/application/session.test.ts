/**
 * Cas d'usage testés avec des ports doublés : pas de base, pas de bcrypt réel.
 * Ce qui est vérifié ici, ce sont les décisions — pas la persistance.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { identifiant } from '@/noyau/identifiants'
import type {
  IdentifiantApprenant,
  IdentifiantCompte,
  IdentifiantEtablissement,
  IdentifiantClasse,
  JetonSession,
} from '@/noyau/identifiants'
import { ouvrirSessionApprenant } from './ouvrir-session-apprenant'
import { ouvrirSessionCompte } from './ouvrir-session-compte'
import { resoudreSession } from './resoudre-session'
import type {
  ApprenantAuthentifiable,
  CompteAuthentifiable,
  DepotIdentite,
  Hachage,
  Horloge,
  ProfilCompte,
  SessionApprenantStockee,
} from '../ports/depot-identite'
import { AUCUN_VERROU, ESSAIS_AVANT_VERROU, type EtatVerrou } from '../domaine/verrou'

const ETAB = identifiant<IdentifiantEtablissement>('etab-a')
const LEA = identifiant<IdentifiantApprenant>('lea')

class DepotDouble implements DepotIdentite {
  apprenants = new Map<string, ApprenantAuthentifiable>()
  verrous = new Map<string, EtatVerrou>()
  sessions = new Map<string, SessionApprenantStockee>()
  profils = new Map<string, ProfilCompte>()
  comptes = new Map<string, CompteAuthentifiable>()
  sessionsCompte = new Map<string, IdentifiantCompte>()
  vus: string[] = []
  jetonsCrees = 0

  async trouverApprenantParIdentifiant(id: string) {
    return this.apprenants.get(id) ?? null
  }
  async lireVerrou(id: string) {
    return this.verrous.get(id) ?? null
  }
  async ecrireVerrou(id: string, etat: EtatVerrou) {
    this.verrous.set(id, etat)
  }
  async creerSessionApprenant(apprenantId: IdentifiantApprenant) {
    const jeton = identifiant<JetonSession>(`jeton-${++this.jetonsCrees}`)
    this.sessions.set(jeton, { apprenantId, etablissementId: ETAB })
    return jeton
  }
  async resoudreJetonApprenant(jeton: JetonSession) {
    return this.sessions.get(jeton) ?? null
  }
  async revoquerSessionsApprenant() {}
  async chargerProfilCompte(compteId: IdentifiantCompte) {
    return this.profils.get(compteId) ?? null
  }
  async trouverCompteParEmail(email: string) {
    return this.comptes.get(email) ?? null
  }
  async creerSessionCompte(compteId: IdentifiantCompte) {
    const jeton = identifiant<JetonSession>(`jeton-compte-${++this.jetonsCrees}`)
    this.sessionsCompte.set(jeton, compteId)
    return jeton
  }
  async resoudreJetonCompte(jeton: JetonSession) {
    return this.sessionsCompte.get(jeton) ?? null
  }
  async marquerVu(sujetId: string) {
    this.vus.push(sujetId)
  }
}

/** Hachage factice : « bon-<code> » vaut le code. Aucun coût de calcul. */
const hachage: Hachage = {
  async verifier(clair, hache) {
    return hache === `bon-${clair}`
  },
  async hacher(clair) {
    return `bon-${clair}`
  },
}

let instant = new Date('2026-09-15T08:55:00Z')
const horloge: Horloge = { maintenant: () => instant }
const avancerDe = (minutes: number) => {
  instant = new Date(instant.getTime() + minutes * 60_000)
}

let depot: DepotDouble

beforeEach(() => {
  depot = new DepotDouble()
  instant = new Date('2026-09-15T08:55:00Z')
  depot.apprenants.set('lea.0820001a', {
    id: LEA,
    etablissementId: ETAB,
    codeHash: 'bon-4271',
    actif: true,
  })
})

const ouvrir = (id: string, code: string) =>
  ouvrirSessionApprenant({ identifiant: id, code }, { depot, hachage, horloge })

describe('ouverture de session apprenant', () => {
  it('réussit avec le bon code', async () => {
    const r = await ouvrir('lea.0820001a', '4271')
    expect(r.ok).toBe(true)
    expect(r.ok && r.valeur.jeton).toBe('jeton-1')
    expect(depot.vus).toEqual([LEA])
  })

  it("tolère la casse et les espaces autour de l'identifiant", async () => {
    const r = await ouvrir('  LEA.0820001A ', '4271')
    expect(r.ok).toBe(true)
  })

  it('refuse un code au mauvais format sans toucher à la base', async () => {
    const r = await ouvrir('lea.0820001a', '42')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erreur.code).toBe('donnees_invalides')
    expect(depot.jetonsCrees).toBe(0)
  })

  it("répond la même chose pour un identifiant inconnu et un code faux", async () => {
    // Distinguer les deux permettrait d'énumérer les identifiants valides
    // puis d'y concentrer la force brute.
    const inconnu = await ouvrir('personne.0820001a', '4271')
    const codeFaux = await ouvrir('lea.0820001a', '0000')

    expect(inconnu.ok).toBe(false)
    expect(codeFaux.ok).toBe(false)
    expect(!inconnu.ok && inconnu.erreur.message).toBe(!codeFaux.ok && codeFaux.erreur.message)
  })

  it("refuse un apprenant désactivé, sans le dire", async () => {
    depot.apprenants.set('parti.0820001a', {
      id: identifiant<IdentifiantApprenant>('parti'),
      etablissementId: ETAB,
      codeHash: 'bon-1234',
      actif: false,
    })
    const r = await ouvrir('parti.0820001a', '1234')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erreur.message).toBe('Identifiant ou code incorrect.')
  })
})

describe('anti-force brute', () => {
  it(`verrouille après ${ESSAIS_AVANT_VERROU} échecs rapprochés`, async () => {
    for (let i = 0; i < ESSAIS_AVANT_VERROU; i++) {
      await ouvrir('lea.0820001a', '0000')
      avancerDe(1)
    }

    // Même le bon code ne passe plus : 10 000 combinaisons ne protègent rien
    // sans cette limite.
    const r = await ouvrir('lea.0820001a', '4271')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erreur.code).toBe('compte_verrouille')
  })

  it("ne verrouille pas des erreurs étalées dans la journée", async () => {
    // Ce sont des élèves : ils se trompent de code, plusieurs fois, sur des
    // heures différentes. La fenêtre glisse.
    for (let i = 0; i < ESSAIS_AVANT_VERROU + 3; i++) {
      await ouvrir('lea.0820001a', '0000')
      avancerDe(90)
    }

    const r = await ouvrir('lea.0820001a', '4271')
    expect(r.ok).toBe(true)
  })

  it('un succès remet le compteur à zéro', async () => {
    for (let i = 0; i < ESSAIS_AVANT_VERROU - 1; i++) {
      await ouvrir('lea.0820001a', '0000')
      avancerDe(1)
    }
    expect((await ouvrir('lea.0820001a', '4271')).ok).toBe(true)
    expect(depot.verrous.get('lea.0820001a')).toEqual(AUCUN_VERROU)
  })

  it("le verrou est levé par l'enseignant, pas par le temps qui passe", async () => {
    for (let i = 0; i < ESSAIS_AVANT_VERROU; i++) {
      await ouvrir('lea.0820001a', '0000')
      avancerDe(1)
    }
    avancerDe(60 * 24 * 30) // un mois plus tard

    const r = await ouvrir('lea.0820001a', '4271')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erreur.code).toBe('compte_verrouille')
  })

  it("un compte verrouillé ne déclenche aucune comparaison de code", async () => {
    for (let i = 0; i < ESSAIS_AVANT_VERROU; i++) {
      await ouvrir('lea.0820001a', '0000')
      avancerDe(1)
    }
    let appels = 0
    const hachageCompte: Hachage = {
      async verifier() {
        appels++
        return true
      },
      hacher: hachage.hacher,
    }
    await ouvrirSessionApprenant(
      { identifiant: 'lea.0820001a', code: '4271' },
      { depot, hachage: hachageCompte, horloge },
    )
    expect(appels).toBe(0)
  })
})

describe('résolution de session', () => {
  const COMPTE = identifiant<IdentifiantCompte>('compte-ens')
  const CLASSE = identifiant<IdentifiantClasse>('classe-1')

  beforeEach(() => {
    depot.profils.set(COMPTE, {
      compteId: COMPTE,
      attributions: [
        { role: 'enseignant', portee: { type: 'etablissement', etablissementId: ETAB } },
      ],
      etablissementId: ETAB,
      classes: [CLASSE],
    })
  })

  it('sans preuve, la session est anonyme', async () => {
    const s = await resoudreSession({}, depot)
    expect(s.sujetId).toBeNull()
    expect(s.attributions).toEqual([])
  })

  it('un compte donne ses attributions et ses classes', async () => {
    const s = await resoudreSession({ compteId: COMPTE }, depot)
    expect(s.sujetId).toBe(COMPTE)
    expect(s.classes).toEqual([CLASSE])
    expect(s.origine).toBe('compte')
  })

  it("un jeton apprenant donne une portée « soi », et rien d'autre", async () => {
    const ouverture = await ouvrir('lea.0820001a', '4271')
    const jeton = ouverture.ok ? ouverture.valeur.jeton : null

    const s = await resoudreSession({ jetonApprenant: jeton }, depot)
    expect(s.sujetId).toBe(LEA)
    expect(s.attributions).toEqual([{ role: 'apprenant', portee: { type: 'soi' } }])
    expect(s.classes).toEqual([])
    expect(s.origine).toBe('jeton_apprenant')
  })

  it("un jeton inconnu ne donne pas une session dégradée mais aucune session", async () => {
    const s = await resoudreSession(
      { jetonApprenant: identifiant<JetonSession>('inventé') },
      depot,
    )
    expect(s.sujetId).toBeNull()
  })

  it("quand les deux preuves coexistent, le compte l'emporte sans cumul", async () => {
    // Cas réel : un formateur qui a testé un accès élève sur son poste.
    const ouverture = await ouvrir('lea.0820001a', '4271')
    const jeton = ouverture.ok ? ouverture.valeur.jeton : null

    const s = await resoudreSession({ compteId: COMPTE, jetonApprenant: jeton }, depot)
    expect(s.sujetId).toBe(COMPTE)
    expect(s.attributions.map((a) => a.role)).toEqual(['enseignant'])
    expect(s.attributions.map((a) => a.role)).not.toContain('apprenant')
  })
})


describe('connexion adulte (transitoire, avant Supabase)', () => {
  const COMPTE = identifiant<IdentifiantCompte>('compte-ens')

  beforeEach(() => {
    depot.comptes.set('marc@mfr-escatalens.fr', {
      id: COMPTE,
      motDePasseHash: 'bon-motdepasse-solide',
      actif: true,
    })
    depot.profils.set(COMPTE, {
      compteId: COMPTE,
      attributions: [
        { role: 'enseignant', portee: { type: 'etablissement', etablissementId: ETAB } },
      ],
      etablissementId: ETAB,
      classes: [],
    })
  })

  const connecter = (email: string, motDePasse: string) =>
    ouvrirSessionCompte({ email, motDePasse }, { depot, hachage, horloge })

  it('ouvre une session avec le bon mot de passe', async () => {
    const r = await connecter('marc@mfr-escatalens.fr', 'motdepasse-solide')
    expect(r.ok).toBe(true)
  })

  it("tolère la casse et les espaces autour de l'adresse", async () => {
    const r = await connecter('  MARC@MFR-ESCATALENS.FR ', 'motdepasse-solide')
    expect(r.ok).toBe(true)
  })

  it('répond la même chose pour une adresse inconnue et un mot de passe faux', async () => {
    const inconnu = await connecter('personne@mfr.fr', 'motdepasse-solide')
    const faux = await connecter('marc@mfr-escatalens.fr', 'raté')
    expect(inconnu.ok).toBe(false)
    expect(faux.ok).toBe(false)
    expect(!inconnu.ok && inconnu.erreur.message).toBe(!faux.ok && faux.erreur.message)
  })

  it("verrouille l'adresse après cinq échecs, comme pour un élève", async () => {
    // Un mot de passe d'enseignant protège les données de trente mineurs :
    // il mérite au moins autant de soin qu'un code à 4 chiffres.
    for (let i = 0; i < ESSAIS_AVANT_VERROU; i++) {
      await connecter('marc@mfr-escatalens.fr', 'raté')
      avancerDe(1)
    }
    const r = await connecter('marc@mfr-escatalens.fr', 'motdepasse-solide')
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erreur.code).toBe('compte_verrouille')
  })

  it('la session ouverte porte bien les attributions du compte', async () => {
    const ouverture = await connecter('marc@mfr-escatalens.fr', 'motdepasse-solide')
    if (!ouverture.ok) throw new Error('ouverture attendue')

    const compteId = await depot.resoudreJetonCompte(ouverture.valeur.jeton)
    const session = await resoudreSession({ compteId }, depot)

    expect(session.origine).toBe('compte')
    expect(session.attributions.map((a) => a.role)).toEqual(['enseignant'])
  })

  it("un compte sans mot de passe local ne s'authentifie pas par cette voie", async () => {
    // C'est le cas d'un compte déjà migré vers Supabase Auth.
    depot.comptes.delete('marc@mfr-escatalens.fr')
    const r = await connecter('marc@mfr-escatalens.fr', 'motdepasse-solide')
    expect(r.ok).toBe(false)
  })
})
