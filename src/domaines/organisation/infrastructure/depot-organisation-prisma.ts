import type { PrismaClient } from '@prisma/client'
import { identifiant } from '@/noyau/identifiants'
import type {
  IdentifiantApprenant,
  IdentifiantClasse,
  IdentifiantEtablissement,
} from '@/noyau/identifiants'
import type { DossierRgpd } from '../domaine/dossier-rgpd'
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

    async assemblerDossier(apprenantId, etablissementId): Promise<DossierRgpd | null> {
      const apprenant = await prisma.apprenant.findFirst({
        // `etablissementId` dans le filtre et pas seulement dans la RLS : un
        // export est l'endroit où une erreur de périmètre coûte le plus cher.
        where: { id: apprenantId, etablissementId },
        select: {
          prenom: true,
          initialeNom: true,
          identifiant: true,
          creeLe: true,
          etablissement: { select: { nom: true } },
          // Aucune donnée des camarades n'est demandée : la classe n'est lue
          // que par son nom.
          inscriptions: { select: { classe: { select: { nom: true } } } },
          acquis: {
            select: {
              niveau: true,
              constateLe: true,
              competence: { select: { code: true, intitule: true } },
            },
            orderBy: { constateLe: 'asc' },
          },
          tentatives: {
            select: {
              statut: true,
              score: true,
              scoreMax: true,
              soumiseLe: true,
              evaluation: { select: { titre: true } },
            },
            orderBy: { creeLe: 'asc' },
          },
          lectures: {
            select: { termineeLe: true, lecon: { select: { titre: true } } },
          },
        },
      })
      if (!apprenant) return null

      const jour = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

      return {
        version: 1,
        genereLe: new Date().toISOString(),
        etablissement: apprenant.etablissement.nom,
        eleve: {
          prenom: apprenant.prenom,
          initialeNom: apprenant.initialeNom,
          identifiant: apprenant.identifiant,
          inscritLe: jour(apprenant.creeLe) ?? '',
        },
        classes: apprenant.inscriptions.map((i) => i.classe.nom),
        acquis: apprenant.acquis.map((a) => ({
          competence: a.competence.code,
          intitule: a.competence.intitule,
          niveau: a.niveau,
          constateLe: jour(a.constateLe) ?? '',
        })),
        evaluations: apprenant.tentatives.map((t) => ({
          evaluation: t.evaluation.titre,
          statut: t.statut,
          score: t.score === null ? null : Number(t.score),
          scoreMax: t.scoreMax === null ? null : Number(t.scoreMax),
          soumiseLe: t.soumiseLe ? t.soumiseLe.toISOString() : null,
        })),
        lectures: apprenant.lectures.map((l) => ({
          lecon: l.lecon.titre,
          termineeLe: jour(l.termineeLe),
        })),
      }
    },

    async prenomsDesCamarades(apprenantId, etablissementId) {
      const inscriptions = await prisma.inscription.findMany({
        where: { apprenantId },
        select: { classeId: true },
      })
      if (inscriptions.length === 0) return []

      const camarades = await prisma.apprenant.findMany({
        where: {
          etablissementId,
          id: { not: apprenantId },
          inscriptions: { some: { classeId: { in: inscriptions.map((i) => i.classeId) } } },
        },
        select: { prenom: true },
      })

      return camarades.map((c) => c.prenom)
    },

    async anonymiserApprenant(apprenantId, etablissementId, valeurs) {
      await prisma.apprenant.update({
        where: { id: apprenantId, etablissementId },
        data: { ...valeurs },
      })
    },

    async relireApprenant(apprenantId) {
      return prisma.apprenant.findUnique({
        where: { id: apprenantId },
        select: {
          prenom: true,
          initialeNom: true,
          identifiant: true,
          codeHash: true,
          compteId: true,
          vuLe: true,
        },
      })
    },
  }
}
