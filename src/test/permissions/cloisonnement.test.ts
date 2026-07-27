/**
 * Famille 3 — cloisonnement inter-établissements.
 *
 * C'est le test le plus important du projet. Une fuite entre deux
 * établissements n'est pas un bug : c'est la fin de la crédibilité de la
 * plateforme. Elle ne peut pas dépendre d'une relecture humaine.
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

describe('cloisonnement entre établissements', () => {
  it("un enseignant de A ne voit aucun apprenant de B", async () => {
    const vus = await bd.en<{ id: string; etablissement_id: string }>(
      { type: 'compte', compteId: jeu.a.enseignantId },
      'SELECT id, etablissement_id FROM raai_apprendre.apprenant',
    )

    expect(vus.length).toBeGreaterThan(0)
    expect(vus.every((v) => v.etablissement_id === jeu.a.id)).toBe(true)
    expect(vus.some((v) => v.id === jeu.b.apprenantId)).toBe(false)
  })

  it("un enseignant de A ne voit aucune classe de B", async () => {
    const classes = await bd.en<{ id: string }>(
      { type: 'compte', compteId: jeu.a.enseignantId },
      'SELECT id FROM raai_apprendre.classe',
    )
    expect(classes.map((c) => c.id)).toEqual([jeu.a.classeId])
  })

  it("un enseignant de A ne voit aucune leçon de B", async () => {
    const lecons = await bd.en<{ id: string }>(
      { type: 'compte', compteId: jeu.a.enseignantId },
      'SELECT id FROM raai_apprendre.lecon',
    )
    const ids = lecons.map((l) => l.id)
    expect(ids).toContain(jeu.a.leconPublieeId)
    expect(ids).not.toContain(jeu.b.leconPublieeId)
    expect(ids).not.toContain(jeu.b.leconBrouillonId)
  })

  it("un enseignant de A ne voit aucune note de B", async () => {
    const tentatives = await bd.en<{ id: string }>(
      { type: 'compte', compteId: jeu.a.enseignantId },
      'SELECT id FROM raai_apprendre.tentative',
    )
    expect(tentatives.map((t) => t.id)).not.toContain(jeu.b.tentativeId)
  })

  it("un enseignant de A ne peut pas écrire dans B, même en visant l'identifiant exact", async () => {
    // La tentative la plus directe : on connaît l'UUID cible et on l'écrit.
    const refuse = await bd.refuse(
      { type: 'compte', compteId: jeu.a.enseignantId },
      `UPDATE raai_apprendre.lecon SET titre = 'détourné' WHERE id = $1`,
      [jeu.b.leconPublieeId],
    )
    // Un UPDATE hors périmètre ne lève pas : il ne touche simplement aucune
    // ligne. C'est le comportement attendu — et il faut le vérifier ainsi.
    if (!refuse) {
      const inchangee = await bd.en<{ titre: string }>(
        { type: 'compte', compteId: jeu.b.enseignantId },
        'SELECT titre FROM raai_apprendre.lecon WHERE id = $1',
        [jeu.b.leconPublieeId],
      )
      expect(inchangee[0]?.titre).toBe('Le circuit hydraulique')
    }
  })

  it("un apprenant de A ne voit aucun apprenant de B", async () => {
    const vus = await bd.en<{ id: string }>(
      { type: 'apprenant', jeton: jeu.a.jetonApprenant },
      'SELECT id FROM raai_apprendre.apprenant',
    )
    expect(vus.map((v) => v.id)).not.toContain(jeu.b.apprenantId)
  })

  it("un apprenant ne voit pas les résultats d'un autre apprenant", async () => {
    const autre = '00000000-0000-4000-8000-000000009999'
    await bd.prepare(
      `INSERT INTO raai_apprendre.apprenant (id, etablissement_id, prenom, identifiant)
       VALUES ($1, $2, 'Thomas', 'thomas.test')`,
      [autre, jeu.a.id],
    )
    await bd.prepare(
      `INSERT INTO raai_apprendre.acquis_competence
         (id, apprenant_id, competence_id, version_referentiel_id, etablissement_id,
          niveau, origine)
       VALUES ('00000000-0000-4000-8000-000000009998', $1, $2, $3, $4, 'acquise', 'evaluation')`,
      [autre, jeu.competenceId, jeu.versionId, jeu.a.id],
    )

    const acquis = await bd.en<{ apprenant_id: string }>(
      { type: 'apprenant', jeton: jeu.a.jetonApprenant },
      'SELECT apprenant_id FROM raai_apprendre.acquis_competence',
    )

    // Même classe, même établissement : la limite est l'élève, pas le groupe.
    expect(acquis.every((a) => a.apprenant_id === jeu.a.apprenantId)).toBe(true)
  })

  it('un jeton révoqué ne donne plus rien', async () => {
    await bd.prepare(
      `UPDATE raai_apprendre.session_apprenant SET revoquee_le = now() WHERE jeton = $1`,
      [jeu.b.jetonApprenant],
    )
    const acquis = await bd.en(
      { type: 'apprenant', jeton: jeu.b.jetonApprenant },
      'SELECT id FROM raai_apprendre.acquis_competence',
    )
    expect(acquis).toEqual([])
  })

  it('un anonyme ne voit aucune donnée pédagogique ni personnelle', async () => {
    for (const table of [
      'apprenant',
      'tentative',
      'acquis_competence',
      'classe',
      'inscription',
      'lecon',
    ]) {
      const lignes = await bd.en({ type: 'anonyme' }, `SELECT id FROM raai_apprendre.${table}`)
      expect(lignes, `table ${table} visible d'un anonyme`).toEqual([])
    }
  })

  it("le référentiel national reste lisible de tous — c'est le patrimoine commun", async () => {
    for (const sujet of [
      { type: 'anonyme' } as const,
      { type: 'compte', compteId: jeu.a.enseignantId } as const,
      { type: 'apprenant', jeton: jeu.a.jetonApprenant } as const,
    ]) {
      const competences = await bd.en(
        sujet,
        'SELECT id FROM raai_apprendre_ref.competence',
      )
      expect(competences.length).toBeGreaterThan(0)
    }
  })
})
