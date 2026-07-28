/**
 * Famille 4 — inviolabilité du journal d'audit.
 *
 * Un journal qu'on peut lire, modifier ou vider ne prouve rien. Ces tests
 * vérifient les trois propriétés, sur un PostgreSQL réel : écriture possible
 * par la seule fonction prévue, lecture impossible, réécriture impossible.
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

const journaliser = (action: string, etablissementId: string | null = null) =>
  bd.prepare(
    `SELECT raai_apprendre_audit.journaliser(
       NULL, 'compte', 'enseignant', $1, 'lecon', NULL, $2::uuid, 'req-test', $3)`,
    [action, etablissementId, '192.168.1.42'],
  )

describe('écriture', () => {
  it("passe par la fonction, et seulement par elle", async () => {
    await journaliser('lecon.publiee', jeu.a.id)

    const lignes = await bd.prepare(
      `SELECT action FROM raai_apprendre_audit.evenement WHERE action = 'lecon.publiee'`,
    )
    expect(lignes.rows).toHaveLength(1)
  })

  it("tronque l'adresse IP même si l'appelant transmet l'adresse entière", async () => {
    // La règle vit en base, pas seulement dans le code applicatif qui pourrait
    // l'oublier un jour.
    const lignes = await bd.prepare(
      `SELECT ip_tronquee FROM raai_apprendre_audit.evenement WHERE action = 'lecon.publiee'`,
    )
    expect((lignes.rows[0] as { ip_tronquee: string }).ip_tronquee).toBe('192.168.1.0')
  })

  it("n'offre aucun paramètre où déverser un contenu", async () => {
    // La signature de la fonction est la garantie : neuf paramètres, tous des
    // métadonnées. Il n'existe pas de champ « détail » ou « commentaire ».
    const parametres = await bd.prepare(
      `SELECT pg_get_function_arguments(p.oid) AS args
         FROM pg_proc p
         JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'raai_apprendre_audit' AND p.proname = 'journaliser'`,
    )
    const args = (parametres.rows[0] as { args: string }).args

    for (const interdit of ['detail', 'contenu', 'commentaire', 'valeur', 'jsonb']) {
      expect(args, interdit).not.toContain(interdit)
    }
  })
})

describe('lecture', () => {
  it("le journal n'est lisible par aucun rôle applicatif", async () => {
    // Le refus arrive au niveau du SCHÉMA, avant même que la RLS ait à
    // trancher : `REVOKE ALL ON SCHEMA` fait échouer la requête plutôt que de
    // renvoyer zéro ligne. C'est plus fort que ce qu'on attendait, et c'est ce
    // qu'on veut d'un journal d'audit.
    for (const sujet of [
      { type: 'anonyme' } as const,
      { type: 'compte', compteId: jeu.a.adminId } as const,
      { type: 'compte', compteId: jeu.adminNationalId } as const,
      { type: 'apprenant', jeton: jeu.a.jetonApprenant } as const,
    ]) {
      const refuse = await bd.refuse(sujet, 'SELECT id FROM raai_apprendre_audit.evenement')
      expect(refuse, sujet.type).toBe(true)
    }
  })

  it("le schéma d'audit n'est même pas accessible", async () => {
    const droits = await bd.prepare(
      `SELECT has_schema_privilege('authenticated', 'raai_apprendre_audit', 'USAGE') AS usage`,
    )
    expect((droits.rows[0] as { usage: boolean }).usage).toBe(false)
  })
})

describe('immuabilité', () => {
  it('refuse la modification', async () => {
    await expect(
      bd.prepare(`UPDATE raai_apprendre_audit.evenement SET action = 'falsifiee'`),
    ).rejects.toThrow(/append-only/)
  })

  it('refuse la suppression', async () => {
    // C'est la propriété qui rend le journal opposable : personne ne peut
    // effacer la trace de ce qu'il vient de faire.
    await expect(
      bd.prepare(`DELETE FROM raai_apprendre_audit.evenement`),
    ).rejects.toThrow(/append-only/)
  })

  it('la purge, elle, a le droit — et elle seule', async () => {
    // Réservée à une tâche planifiée : les droits d'exécution sont révoqués
    // pour les rôles applicatifs.
    const droits = await bd.prepare(
      `SELECT has_function_privilege('authenticated',
         'raai_apprendre_audit.purger()', 'EXECUTE') AS execute`,
    )
    expect((droits.rows[0] as { execute: boolean }).execute).toBe(false)
  })

  it('une purge ne supprime rien de récent', async () => {
    const avant = await bd.prepare(`SELECT count(*)::int AS n FROM raai_apprendre_audit.evenement`)
    await bd.prepare(`SELECT raai_apprendre_audit.purger()`)
    const apres = await bd.prepare(`SELECT count(*)::int AS n FROM raai_apprendre_audit.evenement`)

    expect((apres.rows[0] as { n: number }).n).toBe((avant.rows[0] as { n: number }).n)
  })

  it('et le déclencheur est bien remis après la purge', async () => {
    // Une purge qui laisserait le déclencheur désactivé ouvrirait le journal
    // à la réécriture jusqu'au prochain redémarrage.
    await expect(
      bd.prepare(`DELETE FROM raai_apprendre_audit.evenement`),
    ).rejects.toThrow(/append-only/)
  })
})
