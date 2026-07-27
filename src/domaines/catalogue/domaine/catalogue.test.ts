import { describe, expect, it } from 'vitest'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantCompetence, IdentifiantLecon } from '@/noyau/identifiants'
import {
  alertesAccessibilite,
  dureeEstimeeMinutes,
  lireContenu,
  type Bloc,
} from './bloc'
import {
  peutPasserA,
  prochaineAction,
  validerPourPublication,
  versionSuivante,
  type Lecon,
  type LeconDuParcours,
} from './lecon'

const UUID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

const bloc = (contenu: unknown, genereParIa = false): Bloc => ({
  id: 'b',
  ordre: 1,
  contenu: contenu as Bloc['contenu'],
  genereParIa,
})

const blocTexte = (texte: string) => bloc({ type: 'texte', texte })

const lecon = (partiel: Partial<Lecon> = {}): Lecon => ({
  id: identifiant<IdentifiantLecon>('l1'),
  titre: 'Le circuit hydraulique',
  statut: 'brouillon',
  version: 1,
  dureeEstimeeMin: 10,
  blocs: [blocTexte('Le débit se mesure en litres par minute.')],
  competences: [identifiant<IdentifiantCompetence>('C5')],
  ...partiel,
})

describe('validation des blocs', () => {
  it('accepte un bloc de texte', () => {
    expect(lireContenu({ type: 'texte', texte: 'Bonjour' })).toEqual({
      type: 'texte',
      texte: 'Bonjour',
    })
  })

  it("refuse une image sans alternative textuelle", () => {
    // Sans alternative, l'image est invisible pour un lecteur d'écran et
    // muette dans un export. Ce n'est pas une option.
    expect(lireContenu({ type: 'image', ressourceId: UUID })).toBeNull()
    expect(
      lireContenu({ type: 'image', ressourceId: UUID, alternative: 'Schéma du circuit' }),
    ).not.toBeNull()
  })

  it("refuse un modèle 3D sans description", () => {
    // Une partie du parc des établissements n'a pas de WebGL.
    expect(
      lireContenu({ type: 'modele3d', ressourceId: UUID, titre: 'Vérin', format: 'step' }),
    ).toBeNull()
  })

  it("refuse un type de bloc inconnu plutôt que de le rendre", () => {
    expect(lireContenu({ type: 'iframe', html: '<script>alert(1)</script>' })).toBeNull()
  })

  it("refuse du HTML déguisé en contenu structuré", () => {
    // Le JSONB peut contenir n'importe quoi : un import raté, une écriture
    // manuelle. On ne déduit pas de rendu sans vérifier.
    expect(lireContenu({ type: 'texte' })).toBeNull()
    expect(lireContenu(null)).toBeNull()
    expect(lireContenu('<p>coucou</p>')).toBeNull()
  })

  it("refuse un lien dont le schéma n'est pas navigable", () => {
    // `z.string().url()` seul accepte javascript: — c'est une URL valide au
    // sens de la norme, et un vecteur XSS dans une leçon.
    for (const url of ['javascript:alert(1)', 'data:text/html,<script>x</script>', 'file:///etc']) {
      expect(lireContenu({ type: 'lien', url, titre: 'Piège' }), url).toBeNull()
    }
    expect(
      lireContenu({ type: 'lien', url: 'https://chlorofil.fr', titre: 'ChloroFil' }),
    ).not.toBeNull()
  })
})

describe('durée estimée', () => {
  it("compte au moins une minute, même pour un contenu minuscule", () => {
    expect(dureeEstimeeMinutes([blocTexte('Court.')])).toBe(1)
  })

  it('grandit avec le texte', () => {
    const long = blocTexte('mot '.repeat(900))
    expect(dureeEstimeeMinutes([long])).toBeGreaterThanOrEqual(5)
  })

  it("tient compte de la durée réelle d'une vidéo", () => {
    const video = bloc({
      type: 'video',
      ressourceId: UUID,
      titre: 'Le circuit',
      dureeSecondes: 600,
    })
    expect(dureeEstimeeMinutes([video])).toBe(10)
  })
})

describe('accessibilité', () => {
  it('signale une vidéo sans sous-titres, sans bloquer', () => {
    const video = bloc({ type: 'video', ressourceId: UUID, titre: 'Le circuit' })
    const alertes = alertesAccessibilite([video])
    expect(alertes).toHaveLength(1)
    expect(alertes[0]).toMatch(/sous-titres/)
  })

  it('ne signale rien quand les sous-titres sont là', () => {
    const video = bloc({
      type: 'video',
      ressourceId: UUID,
      titre: 'Le circuit',
      sousTitresRessourceId: UUID,
    })
    expect(alertesAccessibilite([video])).toEqual([])
  })
})

describe('publication', () => {
  it('publie une leçon complète', () => {
    const r = validerPourPublication(lecon())
    expect(r.ok).toBe(true)
  })

  it('refuse une leçon vide', () => {
    const r = validerPourPublication(lecon({ blocs: [] }))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erreur.message).toMatch(/vide/)
  })

  it("refuse une leçon sans compétence rattachée", () => {
    // C'est le refus qui protège tout le suivi de compétences : une leçon non
    // rattachée ne compte dans la progression d'aucun élève.
    const r = validerPourPublication(lecon({ competences: [] }))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erreur.message).toMatch(/compétence/)
  })

  it("refuse de publier du contenu généré non relu", () => {
    const r = validerPourPublication(
      lecon({ blocs: [bloc({ type: 'texte', texte: 'Généré.' }, true)] }),
    )
    expect(r.ok).toBe(false)
    expect(!r.ok && r.erreur.message).toMatch(/par IA/)
  })

  it("l'accepte une fois passé par la relecture", () => {
    const r = validerPourPublication(
      lecon({
        statut: 'en_relecture',
        blocs: [bloc({ type: 'texte', texte: 'Généré puis relu.' }, true)],
      }),
    )
    expect(r.ok).toBe(true)
  })

  it('remonte les alertes sans refuser', () => {
    const video = bloc({ type: 'video', ressourceId: UUID, titre: 'Le circuit' })
    const r = validerPourPublication(lecon({ blocs: [video] }))
    expect(r.ok).toBe(true)
    expect(r.ok && r.valeur.alertes).toHaveLength(1)
  })

  it("refuse de republier une leçon déjà publiée", () => {
    const r = validerPourPublication(lecon({ statut: 'publiee' }))
    expect(r.ok).toBe(false)
  })

  it("une leçon archivée ne revient pas", () => {
    expect(peutPasserA('archivee', 'brouillon')).toBe(false)
    expect(peutPasserA('archivee', 'publiee')).toBe(false)
  })

  it('rouvrir une leçon publiée ouvre une nouvelle version', () => {
    expect(versionSuivante(lecon({ statut: 'publiee', version: 3 }))).toBe(4)
    expect(versionSuivante(lecon({ statut: 'brouillon', version: 3 }))).toBe(3)
  })
})

describe('action prioritaire', () => {
  const l = (
    n: number,
    commencee: boolean,
    terminee: boolean,
  ): LeconDuParcours => ({
    id: identifiant<IdentifiantLecon>(`l${n}`),
    titre: `Leçon ${n}`,
    dureeEstimeeMin: 10,
    ordre: n,
    chapitre: 'Hydraulique',
    commencee,
    terminee,
  })

  it("reprend ce qui est commencé avant d'ouvrir autre chose", () => {
    const choisie = prochaineAction([l(1, true, true), l(2, false, false), l(3, true, false)])
    expect(choisie?.id).toBe('l3')
  })

  it("sinon prend la première non terminée, dans l'ordre du programme", () => {
    const choisie = prochaineAction([l(3, false, false), l(1, true, true), l(2, false, false)])
    expect(choisie?.id).toBe('l2')
  })

  it('ne propose rien quand tout est terminé', () => {
    expect(prochaineAction([l(1, true, true), l(2, true, true)])).toBeNull()
  })

  it("ne propose rien quand il n'y a pas de leçon", () => {
    expect(prochaineAction([])).toBeNull()
  })
})
