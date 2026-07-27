import { PrismaClient } from '@prisma/client'

/**
 * En développement, Next.js recharge les modules à chaque édition. Sans ce
 * cache global, chaque rechargement ouvrirait un nouveau pool de connexions et
 * saturerait Postgres en quelques minutes.
 */
const global_ = globalThis as unknown as { prisma?: PrismaClient }

export const prisma =
  global_.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') global_.prisma = prisma
