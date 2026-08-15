/**
 * Surface publique du module `identite`.
 *
 * On importe ce fichier, jamais l'intérieur du module — `dependency-cruiser`
 * fait échouer le build sinon. Ce qui n'est pas réexporté ici est un détail
 * d'implémentation, libre de changer.
 */

// Le type que tout le reste de l'application manipule.
export {
  SESSION_ANONYME,
  aRole,
  couvreEtablissement,
  encadreClasse,
  estAuthentifie,
  roles,
  type Attribution,
  type OrigineSession,
  type Portee,
  type Role,
  type Session,
} from './domaine/session'

// Autorisation applicative — la seconde couche, au-dessus de la RLS.
export {
  autorise,
  peut,
  type Action,
  type ContexteAutorisation,
  type Decision,
} from './domaine/droits'

// Cas d'usage.
export {
  ouvrirSessionApprenant,
  DUREE_SESSION_JOURS,
  type Entree as EntreeOuvertureSession,
} from './application/ouvrir-session-apprenant'

export {
  ouvrirSessionCompte,
  DUREE_SESSION_COMPTE_JOURS,
  type EntreeCompte,
} from './application/ouvrir-session-compte'

export {
  resoudreSession,
  resoudreSessionAuthentifiee,
  type Preuves,
  type SujetId,
} from './application/resoudre-session'

// Ports, pour l'injection depuis la couche de présentation.
export {
  HORLOGE_SYSTEME,
  type DepotIdentite,
  type Hachage,
  type Horloge,
} from './ports/depot-identite'

// Adaptateurs.
export { depotIdentitePrisma } from './infrastructure/depot-identite-prisma'

export {
  compteDepuisSupabase,
  configurationSupabase,
  connecterCompteSupabase,
  deconnecterCompteSupabase,
  type ConfigurationSupabase,
} from './infrastructure/supabase-auth'
export { genererCode, hachageBcrypt } from './infrastructure/hachage-bcrypt'

// Politique de verrouillage : exposée car l'interface enseignant affiche l'état
// et propose le déblocage.
export {
  debloquer,
  ESSAIS_AVANT_VERROU,
  evaluerVerrou,
  type EtatVerrou,
} from './domaine/verrou'
