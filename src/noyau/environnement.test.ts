import { describe, expect, it } from 'vitest'
import { lireEnvironnement, verifierAucunSecretExpose } from './environnement'

const VALIDE = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/raai',
  DIRECT_URL: 'postgresql://u:p@localhost:5432/raai',
  NEXT_PUBLIC_URL_SITE: 'http://localhost:3000',
  SECRET_SESSION_APPRENANT: 'x'.repeat(32),
}

describe('aucun secret exposé au navigateur', () => {
  it('repère une clé préfixée NEXT_PUBLIC_', () => {
    // Le scénario réel : quelqu'un ajoute le préfixe pour « débloquer » un
    // composant client. La clé est publique dès le premier chargement.
    expect(verifierAucunSecretExpose({ NEXT_PUBLIC_ANTHROPIC_API_KEY: 'sk-x' })).toEqual([
      'NEXT_PUBLIC_ANTHROPIC_API_KEY',
    ])
    expect(verifierAucunSecretExpose({ NEXT_PUBLIC_STRIPE_SECRET_KEY: 'x' })).toHaveLength(1)
    expect(verifierAucunSecretExpose({ NEXT_PUBLIC_UPSTASH_REDIS_REST_TOKEN: 'x' })).toHaveLength(1)
  })

  it("laisse passer les variables publiques légitimes", () => {
    expect(
      verifierAucunSecretExpose({
        NEXT_PUBLIC_URL_SITE: 'https://raai-apprendre.vercel.app',
        NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
        // Conçue pour partir dans le navigateur : elle n'ouvre rien sans RLS.
        NEXT_PUBLIC_SUPABASE_ANON_KEY: 'eyJhbGci...',
        ANTHROPIC_API_KEY: 'sk-x',
      }),
    ).toEqual([])
  })

  it("l'exception est nominative, pas une catégorie", () => {
    // Élargir à « ANON » ouvrirait la porte à n'importe quelle variable qu'on
    // baptiserait ainsi.
    expect(verifierAucunSecretExpose({ NEXT_PUBLIC_ANON_KEY: 'x' })).toHaveLength(1)
    expect(verifierAucunSecretExpose({ NEXT_PUBLIC_SUPABASE_SERVICE_KEY: 'x' })).toHaveLength(1)
  })

  it("fait échouer le démarrage plutôt que de démarrer compromis", () => {
    expect(() =>
      lireEnvironnement({ ...VALIDE, NEXT_PUBLIC_OPENAI_API_KEY: 'sk-x' }),
    ).toThrow(/compromises/)
  })
})

describe('variables requises', () => {
  it('accepte une configuration minimale, Supabase non branché', () => {
    const env = lireEnvironnement(VALIDE)
    expect(env.IA_FOURNISSEUR_DEFAUT).toBe('claude')
    expect(env.NEXT_PUBLIC_SUPABASE_URL).toBeUndefined()
  })

  it('refuse un secret de session trop court', () => {
    // Un secret court ramènerait la sécurité du mode minimal à celle du code
    // à 4 chiffres qu'il est censé protéger.
    expect(() =>
      lireEnvironnement({ ...VALIDE, SECRET_SESSION_APPRENANT: 'court' }),
    ).toThrow(/SECRET_SESSION_APPRENANT/)
  })

  it('nomme précisément ce qui manque', () => {
    const { DATABASE_URL: _, ...sansBase } = VALIDE
    expect(() => lireEnvironnement(sansBase)).toThrow(/DATABASE_URL/)
  })
})

describe('bascule vers Supabase', () => {
  const cles = {
    NEXT_PUBLIC_SUPABASE_URL: 'https://x.supabase.co',
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
  }

  it('accepte les trois variables ensemble', () => {
    expect(() => lireEnvironnement({ ...VALIDE, ...cles })).not.toThrow()
  })

  it('refuse une configuration à moitié remplie', () => {
    // Pire que pas de Supabase du tout : l'application basculerait sur le
    // chemin Supabase sans pouvoir s'authentifier, et personne ne
    // comprendrait pourquoi.
    const { SUPABASE_SERVICE_ROLE_KEY: _, ...partielle } = cles
    expect(() => lireEnvironnement({ ...VALIDE, ...partielle })).toThrow(
      /SUPABASE_SERVICE_ROLE_KEY/,
    )
  })

  it("n'exige rien tant qu'aucune variable Supabase n'est posée", () => {
    expect(() => lireEnvironnement(VALIDE)).not.toThrow()
  })
})
