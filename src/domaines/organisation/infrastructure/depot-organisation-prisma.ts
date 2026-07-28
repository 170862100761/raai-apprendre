import type { PrismaClient } from '@prisma/client'
import { identifiant } from '@/noyau/identifiants'
import type {
  IdentifiantApprenant,
  IdentifiantClasse,
  IdentifiantEtablissement,
} from '@/noyau/identifiants'
import type { DepotOrganisation } from '../ports/depot-organisation'

export function depotOrganisationPrisma(prisma: PrismaClient): DepotOrganisation {
  return {
    async chargerEtablissement(id) {
      const etablissement = await prisma.etablissement.findUnique({
        where: { id },
        select: { id: true, nom: true, uai: true },
      })
      if (!etablissement) return null

      return {
        id: identifiant<IdentifiantEtablissement>(etablissement.id),
        nom: etablissement.nom,
        uai: etablissement.uai,
      }
    },

    async offresDisponibles(etablissementId) {
      const offres = await prisma.offreFormation.findMany({
        where: { etablissementId },
        select: {
          id: true,
          diplome: {
            select: {
              intitule: true,
              niveaux: {
                orderBy: { ordre: 'asc' },
                select: { id: true, code: true, intitule: true },
              },
            },
          },
        },
      })

      return offres.map((o) => ({
        id: o.id,
        intituleDiplome: o.diplome.intitule,
        niveaux: o.diplome.niveaux,
      }))
    },

    async anneesDisponibles(etablissementId) {
      return prisma.anneeScolaire.findMany({
        where: { etablissementId },
        orderBy: { debut: 'desc' },
        select: { id: true, libelle: true },
      })
    },

    async creerClasse(entree) {
      const classe = await prisma.classe.create({
        data: entree,
        select: { id: true, nom: true, codeRattachement: true },
      })

      return {
        id: identifiant<IdentifiantClasse>(classe.id),
        nom: classe.nom,
        codeRattachement: classe.codeRattachement,
      }
    },

    async identifiantsPris(etablissementId) {
      const apprenants = await prisma.apprenant.findMany({
        where: { etablissementId, identifiant: { not: null } },
        select: { identifiant: true },
      })
      return new Set(apprenants.flatMap((a) => (a.identifiant ? [a.identifiant] : [])))
    },

    async inscrireEleves(classeId, etablissementId, eleves) {
      const classe = await prisma.classe.findUnique({
        where: { id: classeId },
        select: { annee: { select: { debut: true } } },
      })

      // Transaction : une classe à moitié inscrite laisse des élèves sans
      // accès et un formateur qui ne sait pas lesquels.
      const crees = await prisma.$transaction(
        eleves.map((eleve) =>
          prisma.apprenant.create({
            data: {
              etablissementId,
              prenom: eleve.prenom,
              initialeNom: eleve.initialeNom,
              identifiant: eleve.identifiant,
              codeHash: eleve.codeHash,
              inscriptions: {
                create: {
                  classeId,
                  etablissementId,
                  debut: classe?.annee.debut ?? new Date(),
                  statut: 'active',
                },
              },
            },
            select: { id: true, identifiant: true },
          }),
        ),
      )

      return crees.flatMap((c) =>
        c.identifiant
          ? [{ id: identifiant<IdentifiantApprenant>(c.id), identifiant: c.identifiant }]
          : [],
      )
    },

    async classeExiste(classeId, etablissementId) {
      const classe = await prisma.classe.findFirst({
        where: { id: classeId, etablissementId },
        select: { id: true },
      })
      return classe !== null
    },
  }
}
