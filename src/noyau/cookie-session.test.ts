import { describe, expect, it } from 'vitest'
import { signerJeton, verifierJeton } from './cookie-session'

const SECRET = 'x'.repeat(32)
const JETON = '3f2504e0-4f89-41d3-9a0c-0305e82c3301'

describe('cookie de session signé', () => {
  it('accepte un cookie qu’il a lui-même produit', async () => {
    const cookie = await signerJeton(JETON, SECRET)
    expect(await verifierJeton(cookie, SECRET)).toBe(JETON)
  })

  it('rejette un jeton modifié', async () => {
    const cookie = await signerJeton(JETON, SECRET)
    const falsifie = cookie.replace(JETON, '00000000-0000-4000-8000-000000000000')
    expect(await verifierJeton(falsifie, SECRET)).toBeNull()
  })

  it('rejette une signature modifiée', async () => {
    const cookie = await signerJeton(JETON, SECRET)
    expect(await verifierJeton(cookie.slice(0, -3) + 'AAA', SECRET)).toBeNull()
  })

  it("rejette un cookie signé avec un autre secret", async () => {
    const cookie = await signerJeton(JETON, 'y'.repeat(32))
    expect(await verifierJeton(cookie, SECRET)).toBeNull()
  })

  it('rejette ce qui ne ressemble à rien, sans lever', async () => {
    // Ces valeurs arrivent réellement : cookies d'une ancienne version,
    // extensions de navigateur, tentatives manuelles.
    for (const valeur of [undefined, '', '.', 'abc', 'abc.', '.abc', 'a.b.c.d']) {
      expect(await verifierJeton(valeur, SECRET)).toBeNull()
    }
  })

  it('produit une valeur stable pour un même jeton', async () => {
    expect(await signerJeton(JETON, SECRET)).toBe(await signerJeton(JETON, SECRET))
  })
})
