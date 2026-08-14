import type { PrismaClient } from '@prisma/client'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantEtablissement } from '@/noyau/identifiants'
import type { DepotFacturation } from '../ports/depot-facturation'

export function depotFacturationPrisma(prisma: PrismaClient): DepotFacturation {
  return {
    async chargerAbonnement(etablissementId) {
      const ligne = await prisma.abonnement.findUnique({
        where: { etablissementId },
      })
      if (!ligne) {
        return {
          etablissementId,
          statut: 'inexistant',
          sieges: 0,
          periodeFinLe: null,
          stripeClientId: null,
        }
      }
      return {
        etablissementId: identifiant<IdentifiantEtablissement>(ligne.etablissementId),
        statut: ligne.statut,
        sieges: ligne.sieges,
        periodeFinLe: ligne.periodeFinLe,
        stripeClientId: ligne.stripeClientId,
      }
    },

    async enregistrerClient(etablissementId, stripeClientId) {
      await prisma.abonnement.upsert({
        where: { etablissementId },
        create: { etablissementId, stripeClientId },
        update: { stripeClientId },
      })
    },

    async appliquerEvenement(evenement) {
      // La création de la ligne d'idempotence et la mise à jour de la
      // projection vont dans la même transaction : un événement à moitié
      // appliqué serait pire qu'un événement perdu, puisque Stripe ne le
      // rejouerait plus.
      try {
        await prisma.$transaction(async (tx) => {
          await tx.evenementPaiement.create({ data: { id: evenement.id } })
          await tx.abonnement.updateMany({
            where: { stripeClientId: evenement.stripeClientId },
            data: {
              stripeAbonnementId: evenement.stripeAbonnementId,
              statut: evenement.statut,
              sieges: evenement.sieges,
              periodeFinLe: evenement.periodeFinLe,
            },
          })
        })
        return true
      } catch (erreur) {
        // P2002 : l'événement est déjà en table — Stripe rejoue, c'est normal.
        if (
          typeof erreur === 'object' &&
          erreur !== null &&
          'code' in erreur &&
          erreur.code === 'P2002'
        ) {
          return false
        }
        throw erreur
      }
    },

    async compterInscrits(etablissementId) {
      return prisma.apprenant.count({ where: { etablissementId, actif: true } })
    },
  }
}
