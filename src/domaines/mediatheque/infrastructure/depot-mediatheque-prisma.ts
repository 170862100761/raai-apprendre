import type { PrismaClient } from '@prisma/client'
import { identifiant } from '@/noyau/identifiants'
import type { IdentifiantEtablissement } from '@/noyau/identifiants'
import type { DepotMediatheque, RessourceStockee } from '../ports/stockage'

export function depotMediathequePrisma(prisma: PrismaClient): DepotMediatheque {
  return {
    async enregistrer(entree) {
      const ressource = await prisma.ressource.create({
        data: {
          etablissementId: entree.etablissementId,
          nom: entree.nom,
          typeMime: entree.typeMime,
          cheminStockage: entree.cheminStockage,
          tailleOctets: BigInt(entree.tailleOctets),
          // Le transcodage vidéo et la pré-tessellation 3D arriveront avec
          // leurs jobs ; en attendant, un fichier déposé est utilisable tel
          // quel, et le dire évite un statut « en attente » qui ne bougerait
          // jamais.
          statutTraitement: 'pret',
        },
        select: { id: true },
      })
      return ressource.id
    },

    async charger(id): Promise<RessourceStockee | null> {
      const ressource = await prisma.ressource.findUnique({
        where: { id },
        select: {
          id: true,
          etablissementId: true,
          nom: true,
          typeMime: true,
          cheminStockage: true,
          tailleOctets: true,
          statutTraitement: true,
        },
      })
      if (!ressource) return null

      return {
        id: ressource.id,
        etablissementId: ressource.etablissementId
          ? identifiant<IdentifiantEtablissement>(ressource.etablissementId)
          : null,
        nom: ressource.nom,
        typeMime: ressource.typeMime,
        cheminStockage: ressource.cheminStockage,
        tailleOctets: Number(ressource.tailleOctets),
        statutTraitement: ressource.statutTraitement,
      }
    },
  }
}
