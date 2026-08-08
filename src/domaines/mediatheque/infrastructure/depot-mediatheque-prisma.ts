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
          statutTraitement: entree.statutTraitement,
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
          cheminApercu: true,
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
        cheminApercu: ressource.cheminApercu,
        tailleOctets: Number(ressource.tailleOctets),
        statutTraitement: ressource.statutTraitement,
      }
    },

    async enregistrerApercu(id, cheminApercu) {
      // Chemin et statut dans la même écriture : un aperçu enregistré sans
      // passer à « prêt » resterait invisible, et un « prêt » sans chemin
      // promettrait un fichier absent.
      await prisma.ressource.update({
        where: { id },
        data: { cheminApercu, statutTraitement: 'pret' },
      })
    },

    async marquerTraitement(id, statut) {
      await prisma.ressource.update({
        where: { id },
        data: { statutTraitement: statut },
      })
    },
  }
}
