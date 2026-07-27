/**
 * bcrypt, en Node, jamais en SQL.
 *
 * Un coût de 10 : suffisant pour un code à 4 chiffres dont la vraie protection
 * est le verrouillage après 5 essais, et assez léger pour ne pas saturer une
 * fonction serverless quand trente élèves se connectent à la même minute.
 * Monter le coût sans changer le verrou n'apporterait rien qu'une facture.
 */
import bcrypt from 'bcryptjs'
import type { Hachage } from '../ports/depot-identite'

const COUT = 10

export const hachageBcrypt: Hachage = {
  verifier: (clair, hache) => bcrypt.compare(clair, hache),
  hacher: (clair) => bcrypt.hash(clair, COUT),
}

/** Code à 4 chiffres tiré au sort, sans les suites trop devinables. */
export function genererCode(aleatoire: () => number = Math.random): string {
  const INTERDITS = new Set([
    '0000', '1111', '2222', '3333', '4444', '5555', '6666', '7777', '8888', '9999',
    '1234', '4321', '0123', '1212', '2020', '2026',
  ])

  for (;;) {
    const code = String(Math.floor(aleatoire() * 10_000)).padStart(4, '0')
    if (!INTERDITS.has(code)) return code
  }
}
