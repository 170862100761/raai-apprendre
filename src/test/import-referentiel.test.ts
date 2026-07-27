/**
 * L'extracteur est testé sur des PDF DGER réels, pas sur des fixtures inventées.
 * Une mise en page simulée prouverait seulement que le parseur lit ce que le
 * test a écrit.
 *
 * Les PDF sont téléchargés une fois puis mis en cache dans travail/, qui est
 * hors dépôt. Sans réseau, les tests sont ignorés plutôt que rouges : ils ne
 * doivent pas bloquer une CI pour une indisponibilité de chlorofil.fr.
 */
import { describe, expect, it, beforeAll } from 'vitest'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
// @ts-expect-error — outil en JavaScript pur, hors du graphe applicatif.
import { extraireReferentiel } from '../../outils/import-referentiel/extraire.mjs'

const TRAVAIL = join(process.cwd(), 'outils', 'import-referentiel', 'travail')

const RENOVE = {
  url: 'https://chlorofil.fr/fileadmin/user_upload/02-diplomes/referentiels/secondaire/bacpro/agroequip/bac-pro-ae-projet-ref.pdf',
  fichier: join(TRAVAIL, 'bac-pro-ae-projet-ref.pdf'),
}

let disponible = false

async function telecharger(url: string, destination: string): Promise<boolean> {
  if (existsSync(destination)) return true
  try {
    const reponse = await fetch(url)
    if (!reponse.ok) return false
    mkdirSync(TRAVAIL, { recursive: true })
    writeFileSync(destination, Buffer.from(await reponse.arrayBuffer()))
    return true
  } catch {
    return false
  }
}

beforeAll(async () => {
  disponible = await telecharger(RENOVE.url, RENOVE.fichier)
}, 120_000)

describe('extraction du Bac Pro Agroéquipement rénové', () => {
  it("restitue les 10 blocs et les 22 sous-capacités", () => {
    if (!disponible) return
    const r = extraireReferentiel(RENOVE.fichier)

    expect(r.statistiques.capacites).toBe(10)
    expect(r.statistiques.sousCapacites).toBe(22)
  })

  it("rattache chaque capacité à son bloc, sauf le module d'adaptation", () => {
    if (!disponible) return
    const r = extraireReferentiel(RENOVE.fichier)

    const sansBloc = r.capacites.filter((c: { codeBloc: string | null }) => !c.codeBloc)
    expect(sansBloc).toHaveLength(1)
    expect(sansBloc[0].code).toBe('C10')
    // C'est ce champ qui déclenchera la saisie d'une adaptation_locale.
    expect(sansBloc[0].adaptableLocalement).toBe(true)

    for (const c of r.capacites.filter((c: { codeBloc: string | null }) => c.codeBloc)) {
      expect(c.codeBloc).toBe(`B${c.code.slice(1)}`)
    }
  })

  it("n'absorbe pas le paragraphe de glose dans l'intitulé de C4.3", () => {
    if (!disponible) return
    const r = extraireReferentiel(RENOVE.fichier)

    // Le défaut du prototype : la glose qui suit C4.3 commence par une
    // minuscule et passait pour une continuation d'intitulé.
    const c4 = r.capacites.find((c: { code: string }) => c.code === 'C4')
    const c43 = c4.sousCapacites.find((s: { code: string }) => s.code === 'C4.3')

    expect(c43.intitule).toBe(
      "Conduire une analyse réflexive de son action au sein d’un collectif",
    )
  })

  it('restitue les intitulés professionnels attendus', () => {
    if (!disponible) return
    const r = extraireReferentiel(RENOVE.fichier)
    const parCode = Object.fromEntries(
      r.capacites.map((c: { code: string; intitule: string }) => [c.code, c.intitule]),
    )

    // C5 distingue le référentiel rénové de celui de 2010, où il portait
    // « Caractériser le fonctionnement des matériels ».
    expect(parCode['C5']).toContain('transitions')
    expect(parCode['C9']).toContain('maintenance')
  })

  it("signale l'absence d'arrêté plutôt que de la passer sous silence", () => {
    if (!disponible) return
    const r = extraireReferentiel(RENOVE.fichier)

    // Ce PDF ne cite pas son propre arrêté. L'import doit le dire : c'est
    // exactement le cas où un rattachement automatique se tromperait de version.
    expect(r.arrete.principal).toBeNull()
    expect(r.alertes.join(' ')).toMatch(/arrêté/i)
  })

  it('produit une empreinte stable du PDF source', () => {
    if (!disponible) return
    const a = extraireReferentiel(RENOVE.fichier)
    const b = extraireReferentiel(RENOVE.fichier)

    expect(a.empreinteSource).toBe(b.empreinteSource)
    expect(a.empreinteSource).toMatch(/^[0-9a-f]{64}$/)
  })
})
