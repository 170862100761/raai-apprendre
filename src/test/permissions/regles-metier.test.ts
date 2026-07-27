/**
 * Famille 2 — les règles qui vivent en base.
 *
 * Ce ne sont pas des détails d'implémentation : ce sont les invariants dont
 * dépend la confiance des élèves et des enseignants. Les laisser au seul code
 * applicatif reviendrait à les perdre au premier contournement.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest'
import { BaseDeTest } from './base'
import { semer, type JeuDeDonnees } from './jeu-de-donnees'

let bd: BaseDeTest
let jeu: JeuDeDonnees

beforeAll(async () => {
  bd = await BaseDeTest.demarrer()
  jeu = await semer(bd)
}, 60_000)

afterAll(async () => {
  await bd.arreter()
})

describe('le corrigé ne sort jamais', () => {
  it("un apprenant ne peut pas lire la table question", async () => {
    const questions = await bd.en(
      { type: 'apprenant', jeton: jeu.a.jetonApprenant },
      'SELECT id, corrige FROM raai_apprendre.question',
    )
    // L'énoncé lui est servi par une fonction qui retire `corrige` ;
    // la table elle-même ne lui est pas ouverte.
    expect(questions).toEqual([])
  })

  it('un enseignant de la classe, lui, y accède', async () => {
    const questions = await bd.en(
      { type: 'compte', compteId: jeu.a.enseignantId },
      'SELECT id FROM raai_apprendre.question',
    )
    expect(questions.length).toBeGreaterThan(0)
  })
})

describe('un acquis ne se dégrade pas tout seul', () => {
  it("une évaluation ratée ne fait pas reculer une compétence acquise", async () => {
    // La règle qui rend le suivi de compétences non anxiogène : sans elle,
    // les élèves cessent de tenter.
    await expect(
      bd.prepare(
        `UPDATE raai_apprendre.acquis_competence
            SET niveau = 'en_cours', origine = 'evaluation'
          WHERE id = $1`,
        [jeu.a.acquisId],
      ),
    ).rejects.toThrow(/ne se dégrade/)
  })

  it("un enseignant peut dégrader explicitement", async () => {
    await expect(
      bd.prepare(
        `UPDATE raai_apprendre.acquis_competence
            SET niveau = 'en_cours', origine = 'declaration_enseignant'
          WHERE id = $1`,
        [jeu.b.acquisId],
      ),
    ).resolves.toBeDefined()
  })
})

describe('immuabilité', () => {
  it("une tentative corrigée ne se modifie pas", async () => {
    await expect(
      bd.prepare(`UPDATE raai_apprendre.tentative SET score = 10 WHERE id = $1`, [
        jeu.a.tentativeId,
      ]),
    ).rejects.toThrow(/corrigée/)
  })

  it("un référentiel publié ne se modifie pas", async () => {
    await expect(
      bd.prepare(
        `UPDATE raai_apprendre_ref.version_referentiel
            SET reference_arrete = 'corrigé à la main' WHERE id = $1`,
        [jeu.versionId],
      ),
    ).rejects.toThrow(/publié/)
  })

  it("le journal d'audit refuse la réécriture", async () => {
    await bd.prepare(
      `INSERT INTO raai_apprendre_audit.evenement
         (id, sujet_type, role_effectif, action, ressource_type, id_requete)
       VALUES ('00000000-0000-4000-8000-000000008888', 'compte', 'enseignant',
               'lecon.publiee', 'lecon', 'req-1')`,
    )
    await expect(
      bd.prepare(`DELETE FROM raai_apprendre_audit.evenement`),
    ).rejects.toThrow(/append-only/)
  })
})

describe('portée « ses classes »', () => {
  it("un enseignant sans affectation ne voit aucun résultat d'élève", async () => {
    const acquis = await bd.en(
      { type: 'compte', compteId: jeu.a.enseignantSansClasseId },
      'SELECT id FROM raai_apprendre.acquis_competence',
    )
    // Le rôle « enseignant » ne dit rien tant qu'on ne sait pas de quelles
    // classes. Sans affectation, la portée est vide.
    expect(acquis).toEqual([])
  })

  it("un responsable pédagogique voit toutes les classes de son établissement", async () => {
    const acquis = await bd.en(
      { type: 'compte', compteId: jeu.a.responsableId },
      'SELECT id, etablissement_id FROM raai_apprendre.acquis_competence',
    )
    expect(acquis.length).toBeGreaterThan(0)
  })

  it("une attribution expirée ne donne plus rien", async () => {
    await bd.prepare(
      `UPDATE raai_apprendre.membre SET expire_le = now() - interval '1 day'
        WHERE compte_id = $1`,
      [jeu.b.enseignantId],
    )
    const apprenants = await bd.en(
      { type: 'compte', compteId: jeu.b.enseignantId },
      'SELECT id FROM raai_apprendre.apprenant',
    )
    expect(apprenants).toEqual([])
  })
})

describe('sessions apprenant', () => {
  it("la table des jetons n'est lisible par personne", async () => {
    for (const sujet of [
      { type: 'anonyme' } as const,
      { type: 'compte', compteId: jeu.a.adminId } as const,
      { type: 'apprenant', jeton: jeu.a.jetonApprenant } as const,
    ]) {
      const sessions = await bd.en(
        sujet,
        'SELECT jeton FROM raai_apprendre.session_apprenant',
      )
      expect(sessions).toEqual([])
    }
  })

  it("un jeton inventé ne donne accès à rien", async () => {
    const acquis = await bd.en(
      { type: 'apprenant', jeton: '00000000-0000-4000-8000-000000007777' },
      'SELECT id FROM raai_apprendre.acquis_competence',
    )
    expect(acquis).toEqual([])
  })
})
