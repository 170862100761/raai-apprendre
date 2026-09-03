#!/usr/bin/env node
/**
 * Rejoue, par Prisma et non par SQL, la lecture que fait `chargerProfilCompte`
 * pour un compte : si le SQL voit des membres et que Prisma n'en voit pas, le
 * problème est entre les deux (schéma du client, RLS, base différente).
 *
 *   node outils/diagnostiquer-profil-prisma.mjs .env.vercel.local essai+enseignant@raai-designer.com
 */
import { readFileSync } from 'node:fs'
import dotenv from 'dotenv'

const [fichier = '.env.local', email] = process.argv.slice(2)
const env = dotenv.parse(readFileSync(fichier))
process.env.DATABASE_URL = env.DATABASE_URL ?? env.DIRECT_URL
process.env.DIRECT_URL = env.DIRECT_URL ?? env.DATABASE_URL

const { PrismaClient } = await import('@prisma/client')
const prisma = new PrismaClient({ log: ['error'] })

const compte = await prisma.compte.findFirst({
  where: { email, actif: true },
  select: {
    id: true,
    membres: {
      where: { OR: [{ expireLe: null }, { expireLe: { gt: new Date() } }] },
      select: { role: true, etablissementId: true, academieId: true, affectations: { select: { classeId: true } } },
    },
  },
})
if (!compte) {
  console.log('Prisma : compte introuvable')
} else {
  console.log(`Prisma : compte ${compte.id.slice(0, 8)}… | membres ${compte.membres.length}`)
  for (const m of compte.membres) console.log(`  - ${m.role} | établissement ${m.etablissementId?.slice(0, 8) ?? 'aucun'} | affectations ${m.affectations.length}`)
}
await prisma.$disconnect()
