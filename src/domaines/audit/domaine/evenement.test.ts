import { describe, expect, it } from 'vitest'
import {
  contientDonneePersonnelle,
  dureeConservation,
  estObligatoire,
  tronquerIp,
  RETENTION_JOURS,
} from './evenement'
import { tracer, verifierCharge } from '../application/tracer'
import type { EvenementAudit } from './evenement'
import type { JournalAudit } from '../ports/journal'

describe('troncature d’adresse IP', () => {
  it('retire le dernier octet en IPv4', () => {
    // On garde de quoi reconnaître un réseau — une salle informatique — sans
    // identifier un poste.
    expect(tronquerIp('192.168.1.42')).toBe('192.168.1.0')
    expect(tronquerIp('10.0.0.255')).toBe('10.0.0.0')
  })

  it('ne garde que le préfixe en IPv6', () => {
    expect(tronquerIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe('2001:0db8:85a3::')
  })

  it('ne garde que la première adresse d’une chaîne de mandataires', () => {
    // `X-Forwarded-For` en contient plusieurs derrière un CDN.
    expect(tronquerIp('203.0.113.7, 70.41.3.18, 150.172.238.178')).toBe('203.0.113.0')
  })

  it('rend null plutôt que d’inventer', () => {
    for (const valeur of [null, undefined, '', '  ', 'inconnue', '1.2.3']) {
      expect(tronquerIp(valeur), String(valeur)).toBeNull()
    }
  })
})

describe('catalogue des actions', () => {
  it('rend obligatoires celles qui ont une conséquence pour un élève', () => {
    for (const action of ['note.modifiee', 'competence.declaree', 'export.produit'] as const) {
      expect(estObligatoire(action), action).toBe(true)
    }
  })

  it('conserve trois ans les traces de sécurité, un an le reste', () => {
    expect(dureeConservation('connexion.echouee')).toBe(RETENTION_JOURS.securite)
    expect(dureeConservation('lecon.publiee')).toBe(RETENTION_JOURS.usage)
  })
})

describe('garde-fou contre les données personnelles', () => {
  it('repère les champs qui n’ont rien à faire dans un journal', () => {
    // Le cas réel : quelqu'un ajoute un champ « pour le débogage » et l'oublie.
    for (const champ of ['prenom', 'email', 'adresse', 'dateNaissance', 'motDePasse', 'code']) {
      expect(contientDonneePersonnelle({ [champ]: 'x' }), champ).toBe(true)
    }
  })

  it('laisse passer des métadonnées', () => {
    expect(contientDonneePersonnelle({ ressourceId: 'x', role: 'enseignant' })).toBe(false)
  })

  it('lève en développement plutôt que d’écrire', () => {
    expect(() => verifierCharge({ prenom: 'Léa' })).toThrow(/personnelle/)
    expect(() => verifierCharge({ ressourceId: 'x' })).not.toThrow()
  })
})

describe('trace d’une action', () => {
  const capturer = () => {
    const ecrits: EvenementAudit[] = []
    const journal: JournalAudit = {
      async journaliser(evenement) {
        ecrits.push(evenement)
      },
    }
    return { ecrits, journal }
  }

  it('enregistre qui, quoi, sur quoi — et rien d’autre', async () => {
    const { ecrits, journal } = capturer()

    await tracer(
      'note.modifiee',
      {
        sujetId: 'compte-1',
        sujetType: 'compte',
        roleEffectif: 'enseignant',
        etablissementId: 'etab-1',
        ip: '192.168.1.42',
        idRequete: 'req-1',
      },
      { type: 'tentative', id: 'tentative-1' },
      journal,
    )

    expect(ecrits).toHaveLength(1)
    const trace = ecrits[0]!

    expect(trace.action).toBe('note.modifiee')
    expect(trace.ressourceType).toBe('tentative')
    expect(trace.ressourceId).toBe('tentative-1')

    // Aucun champ ne porte de contenu : la structure elle-même l'interdit.
    expect(Object.keys(trace).sort()).toEqual([
      'action',
      'etablissementId',
      'idRequete',
      'ipTronquee',
      'ressourceId',
      'ressourceType',
      'roleEffectif',
      'sujetId',
      'sujetType',
    ])
  })

  it('engendre un identifiant de requête quand il manque', async () => {
    const { ecrits, journal } = capturer()
    await tracer(
      'connexion.reussie',
      { sujetId: null, sujetType: 'anonyme', roleEffectif: 'aucun', etablissementId: null },
      { type: 'session' },
      journal,
    )
    expect(ecrits[0]?.idRequete).toMatch(/^[0-9a-f-]{36}$/)
  })

  it("ne fait jamais échouer l'action auditée", async () => {
    // Refuser une connexion parce que le journal est indisponible
    // transformerait une panne d'observabilité en panne de service.
    const journalCasse: JournalAudit = {
      async journaliser() {
        throw new Error('base injoignable')
      },
    }

    await expect(
      tracer(
        'connexion.reussie',
        { sujetId: null, sujetType: 'anonyme', roleEffectif: 'aucun', etablissementId: null },
        { type: 'session' },
        journalCasse,
      ),
    ).resolves.toBeUndefined()
  })
})
