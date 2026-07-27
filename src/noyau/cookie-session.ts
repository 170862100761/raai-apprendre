/**
 * Signature du cookie de session apprenant.
 *
 * Le jeton est déjà un UUID aléatoire vérifié en base : la signature n'ajoute
 * pas de secret, elle évite une requête. À 9h00, quand plusieurs milliers de
 * classes ouvrent la plateforme en même temps, un cookie forgé ou périmé doit
 * être rejeté sans toucher Postgres.
 *
 * Web Crypto et non `node:crypto` : ce module est appelé depuis le middleware,
 * qui s'exécute sur l'Edge.
 */

export const COOKIE_APPRENANT = 'session-apprenant'
export const COOKIE_COMPTE = 'sb-access-token'

const encodeur = new TextEncoder()

async function cle(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encodeur.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

const enBase64Url = (octets: ArrayBuffer): string =>
  btoa(String.fromCharCode(...new Uint8Array(octets)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

export async function signerJeton(jeton: string, secret: string): Promise<string> {
  const signature = await crypto.subtle.sign('HMAC', await cle(secret), encodeur.encode(jeton))
  return `${jeton}.${enBase64Url(signature)}`
}

/**
 * `null` si la valeur est absente, malformée ou mal signée. L'appelant ne
 * distingue pas les trois cas : il n'a rien à en faire, et les distinguer
 * renseignerait un attaquant sur ce qui a échoué.
 */
export async function verifierJeton(
  valeur: string | undefined,
  secret: string,
): Promise<string | null> {
  if (!valeur) return null

  const separateur = valeur.lastIndexOf('.')
  if (separateur <= 0) return null

  const jeton = valeur.slice(0, separateur)
  const signature = depuisBase64Url(valeur.slice(separateur + 1))
  if (!signature) return null

  // `crypto.subtle.verify` compare en temps constant. Une comparaison de
  // chaînes en JavaScript s'arrête au premier octet différent : le temps de
  // réponse laisserait forger la signature octet par octet.
  const valide = await crypto.subtle.verify(
    'HMAC',
    await cle(secret),
    signature,
    encodeur.encode(jeton),
  )

  return valide ? jeton : null
}

function depuisBase64Url(texte: string): ArrayBuffer | null {
  try {
    const base64 = texte.replace(/-/g, '+').replace(/_/g, '/')
    const binaire = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    const octets = new Uint8Array(binaire.length)
    for (let i = 0; i < binaire.length; i++) octets[i] = binaire.charCodeAt(i)
    return octets.buffer
  } catch {
    return null
  }
}

/** Attributs communs à tous les cookies de session. */
export const OPTIONS_COOKIE = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
} as const
