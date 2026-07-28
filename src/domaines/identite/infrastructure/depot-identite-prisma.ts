/**
 * Adaptateur Prisma du port `DepotIdentite`.
 *
 * Seul endroit du module qui connaît Prisma. Les cas d'usage reçoivent ce
 * dépôt par injection et ne savent rien de la technologie.
 */
import type { PrismaClient } from '@prisma/client'
import { identifiant } from '@/noyau/identifiants'
import type {
  IdentifiantApprenant,
  IdentifiantClasse,
  IdentifiantCompte,
  IdentifiantEtablissement,
  JetonSession,
} from '@/noyau/identifiants'
import type { Attribution, Role } from '../domaine/session'
import type { EtatVerrou } from '../domaine/verrou'
import type {
  ApprenantAuthentifiable,
  CompteAuthentifiable,
  DepotIdentite,
  ProfilCompte,
  SessionApprenantStockee,
} from '../ports/depot-identite'

export function depotIdentitePrisma(prisma: PrismaClient): DepotIdentite {
  return {
    async trouverApprenantParIdentifiant(id): Promise<ApprenantAuthentifiable | null> {
      const ligne = await prisma.apprenant.findUnique({
        where: { identifiant: id },
        select: { id: true, etablissementId: true, codeHash: true, actif: true },
      })

      // Un apprenant en mode complet n'a pas de code : il ne s'authentifie pas
      // par cette voie, et ne doit pas être traité comme un code manquant.
      if (!ligne?.codeHash) return null

      return {
        id: identifiant<IdentifiantApprenant>(ligne.id),
        etablissementId: identifiant<IdentifiantEtablissement>(ligne.etablissementId),
        codeHash: ligne.codeHash,
        actif: ligne.actif,
      }
    },

    async lireVerrou(id): Promise<EtatVerrou | null> {
      const ligne = await prisma.verrouAcces.findUnique({ where: { identifiant: id } })
      if (!ligne) return null
      return {
        echecs: ligne.echecs,
        dernierEchec: ligne.dernierEchec,
        verrouilleJusqua: ligne.verrouilleJusqua,
      }
    },

    async ecrireVerrou(id, etat) {
      await prisma.verrouAcces.upsert({
        where: { identifiant: id },
        create: { identifiant: id, ...etat },
        update: etat,
      })
    },

    async creerSessionApprenant(apprenantId, expireLe): Promise<JetonSession> {
      const session = await prisma.sessionApprenant.create({
        data: { apprenantId, expireLe },
        select: { jeton: true },
      })
      return identifiant<JetonSession>(session.jeton)
    },

    async resoudreJetonApprenant(jeton): Promise<SessionApprenantStockee | null> {
      const session = await prisma.sessionApprenant.findFirst({
        where: {
          jeton,
          expireLe: { gt: new Date() },
          revoqueeLe: null,
          apprenant: { actif: true },
        },
        select: { apprenant: { select: { id: true, etablissementId: true } } },
      })
      if (!session) return null

      return {
        apprenantId: identifiant<IdentifiantApprenant>(session.apprenant.id),
        etablissementId: identifiant<IdentifiantEtablissement>(session.apprenant.etablissementId),
      }
    },

    async revoquerSessionsApprenant(apprenantId) {
      await prisma.sessionApprenant.updateMany({
        where: { apprenantId, revoqueeLe: null },
        data: { revoqueeLe: new Date() },
      })
    },

    async chargerProfilCompte(compteId): Promise<ProfilCompte | null> {
      const compte = await prisma.compte.findFirst({
        where: { id: compteId, actif: true },
        select: {
          id: true,
          membres: {
            // Une délégation expirée ne donne plus rien : l'expiration est
            // effective ici, pas seulement dans l'interface.
            where: { OR: [{ expireLe: null }, { expireLe: { gt: new Date() } }] },
            select: {
              role: true,
              etablissementId: true,
              academieId: true,
              affectations: { select: { classeId: true } },
            },
          },
        },
      })
      if (!compte) return null

      const attributions: Attribution[] = compte.membres.map((m) => ({
        role: m.role as Role,
        portee: m.etablissementId
          ? {
              type: 'etablissement' as const,
              etablissementId: identifiant<IdentifiantEtablissement>(m.etablissementId),
            }
          : m.academieId
            ? { type: 'academie' as const, academieId: identifiant(m.academieId) }
            : { type: 'nationale' as const },
      }))

      const classes = compte.membres.flatMap((m) =>
        m.affectations.map((a) => identifiant<IdentifiantClasse>(a.classeId)),
      )

      const premierEtablissement = compte.membres.find((m) => m.etablissementId)?.etablissementId

      // Un responsable pédagogique ou un administrateur voit TOUTES les classes
      // de son établissement, pas seulement celles qu'il encadre. La fonction
      // SQL `classes_du_sujet()` le dit déjà ; sans cela les deux couches
      // divergeraient, et l'écran montrerait moins que ce que la base autorise.
      const pilote = compte.membres.some(
        (m) => m.role === 'responsable_pedagogique' || m.role === 'admin_etablissement',
      )

      if (pilote && premierEtablissement) {
        const toutes = await prisma.classe.findMany({
          where: { etablissementId: premierEtablissement, archivee: false },
          select: { id: true },
        })
        for (const classe of toutes) classes.push(identifiant<IdentifiantClasse>(classe.id))
      }

      return {
        compteId: identifiant<IdentifiantCompte>(compte.id),
        attributions,
        etablissementId: premierEtablissement
          ? identifiant<IdentifiantEtablissement>(premierEtablissement)
          : null,
        classes: [...new Set(classes)],
      }
    },

    async trouverCompteParEmail(email): Promise<CompteAuthentifiable | null> {
      const compte = await prisma.compte.findUnique({
        where: { email },
        select: { id: true, motDePasseHash: true, actif: true },
      })

      // Pas de mot de passe local = compte destiné à Supabase Auth. Il ne
      // s'authentifie pas par cette voie, et ce n'est pas une erreur.
      if (!compte?.motDePasseHash) return null

      return {
        id: identifiant<IdentifiantCompte>(compte.id),
        motDePasseHash: compte.motDePasseHash,
        actif: compte.actif,
      }
    },

    async creerSessionCompte(compteId, expireLe): Promise<JetonSession> {
      const session = await prisma.sessionCompte.create({
        data: { compteId, expireLe },
        select: { jeton: true },
      })
      return identifiant<JetonSession>(session.jeton)
    },

    async resoudreJetonCompte(jeton): Promise<IdentifiantCompte | null> {
      const session = await prisma.sessionCompte.findFirst({
        where: {
          jeton,
          expireLe: { gt: new Date() },
          revoqueeLe: null,
          compte: { actif: true },
        },
        select: { compteId: true },
      })
      return session ? identifiant<IdentifiantCompte>(session.compteId) : null
    },

    async marquerVu(sujetId) {
      // Une seule des deux tables porte cet identifiant ; on ne sait pas
      // laquelle et ce n'est pas au domaine de le dire.
      await Promise.all([
        prisma.apprenant.updateMany({ where: { id: sujetId }, data: { vuLe: new Date() } }),
        prisma.compte.updateMany({ where: { id: sujetId }, data: { vuLe: new Date() } }),
      ])
    },
  }
}
