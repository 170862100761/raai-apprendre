import type { PrismaClient } from '@prisma/client'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantCompetence } from '@/noyau/identifiants'
import type { DepotScores, MeilleurScoreJeu } from '../ports/depot-scores'

export function depotScoresPrisma(prisma: PrismaClient): DepotScores {
  return {
    async enregistrer(s) {
      const ligne = await prisma.scoreJeu.create({
        data: {
          apprenantId: s.apprenantId,
          etablissementId: s.etablissementId,
          jeu: s.jeu,
          score: s.score,
          scoreMax: s.scoreMax,
          part: s.part,
          joueLe: s.joueLe,
        },
        select: { id: true },
      })
      return { id: ligne.id }
    },

    async meilleurs(apprenantId, jeux) {
      if (jeux.length === 0) return new Map()

      const lignes = await prisma.scoreJeu.findMany({
        where: { apprenantId, jeu: { in: [...jeux] } },
        // La meilleure part d'abord ; à égalité, la plus récente.
        orderBy: [{ part: 'desc' }, { joueLe: 'desc' }],
        select: { jeu: true, score: true, scoreMax: true, part: true, joueLe: true },
      })

      const meilleurs = new Map<string, MeilleurScoreJeu>()
      for (const l of lignes) {
        if (meilleurs.has(l.jeu)) continue
        meilleurs.set(l.jeu, {
          score: l.score,
          scoreMax: l.scoreMax,
          part: Number(l.part),
          joueLe: l.joueLe,
        })
      }
      return meilleurs
    },

    async competencesPourCodes(codes) {
      if (codes.length === 0) return []

      const rang1 = codes.map((c) => c.split('.')[0] ?? c)
      const lignes = await prisma.competence.findMany({
        where: {
          version: { statut: 'publie' },
          code: { in: [...new Set([...codes, ...rang1])] },
        },
        select: { id: true, code: true, parentId: true },
      })

      return lignes.map((l) => ({
        id: identifiant<IdentifiantCompetence>(l.id),
        code: l.code,
        parentId: l.parentId,
      }))
    },
  }
}
