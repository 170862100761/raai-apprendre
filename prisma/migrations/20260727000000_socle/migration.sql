-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "raai_apprendre";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "raai_apprendre_audit";

-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "raai_apprendre_ref";

-- CreateEnum
CREATE TYPE "raai_apprendre"."role" AS ENUM ('admin_national', 'admin_academie', 'admin_etablissement', 'responsable_pedagogique', 'enseignant', 'parent');

-- CreateEnum
CREATE TYPE "raai_apprendre"."type_etablissement" AS ENUM ('MFR', 'CFA', 'LPA', 'CFPPA', 'SUP');

-- CreateEnum
CREATE TYPE "raai_apprendre"."mode_identite" AS ENUM ('minimal', 'complet', 'mixte');

-- CreateEnum
CREATE TYPE "raai_apprendre"."statut_inscription" AS ENUM ('en_attente', 'active', 'terminee', 'abandonnee');

-- CreateEnum
CREATE TYPE "raai_apprendre_ref"."ministere" AS ENUM ('MASA', 'MENJ');

-- CreateEnum
CREATE TYPE "raai_apprendre_ref"."statut_referentiel" AS ENUM ('brouillon', 'publie', 'abroge');

-- CreateEnum
CREATE TYPE "raai_apprendre"."statut_publication" AS ENUM ('brouillon', 'en_relecture', 'publiee', 'archivee');

-- CreateEnum
CREATE TYPE "raai_apprendre"."type_bloc" AS ENUM ('texte', 'image', 'schema', 'video', 'modele3d', 'pdf', 'lien', 'bibliographie', 'fichier');

-- CreateEnum
CREATE TYPE "raai_apprendre"."statut_traitement" AS ENUM ('en_attente', 'en_cours', 'pret', 'echoue');

-- CreateEnum
CREATE TYPE "raai_apprendre"."type_evaluation" AS ENUM ('exercice', 'quiz', 'devoir', 'tp', 'ccf', 'examen');

-- CreateEnum
CREATE TYPE "raai_apprendre"."type_question" AS ENUM ('qcm', 'vrai_faux', 'appariement', 'numerique', 'texte_court', 'texte_long');

-- CreateEnum
CREATE TYPE "raai_apprendre"."statut_tentative" AS ENUM ('en_cours', 'soumise', 'corrigee_auto', 'attente_correction', 'corrigee', 'abandonnee');

-- CreateEnum
CREATE TYPE "raai_apprendre"."niveau_acquisition" AS ENUM ('non_abordee', 'en_cours', 'acquise', 'maitrisee');

-- CreateEnum
CREATE TYPE "raai_apprendre"."origine_acquis" AS ENUM ('evaluation', 'declaration_enseignant', 'ccf', 'import');

-- CreateTable
CREATE TABLE "raai_apprendre"."compte" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "nom" TEXT NOT NULL DEFAULT '',
    "prenom" TEXT NOT NULL DEFAULT '',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vu_le" TIMESTAMPTZ(6),

    CONSTRAINT "compte_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."membre" (
    "id" UUID NOT NULL,
    "compte_id" UUID NOT NULL,
    "etablissement_id" UUID,
    "academie_id" UUID,
    "role" "raai_apprendre"."role" NOT NULL,
    "expire_le" TIMESTAMPTZ(6),
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "membre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."affectation" (
    "id" UUID NOT NULL,
    "membre_id" UUID NOT NULL,
    "classe_id" UUID NOT NULL,
    "matiere_id" UUID,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "affectation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."consentement" (
    "id" UUID NOT NULL,
    "compte_id" UUID,
    "apprenant_id" UUID,
    "type" TEXT NOT NULL,
    "version_texte" TEXT NOT NULL,
    "accorde" BOOLEAN NOT NULL,
    "recueilli_par" TEXT NOT NULL,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consentement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."pays" (
    "id" UUID NOT NULL,
    "code" VARCHAR(2) NOT NULL,
    "nom" TEXT NOT NULL,

    CONSTRAINT "pays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."academie" (
    "id" UUID NOT NULL,
    "pays_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,

    CONSTRAINT "academie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."etablissement" (
    "id" UUID NOT NULL,
    "academie_id" UUID NOT NULL,
    "uai" VARCHAR(8) NOT NULL,
    "nom" TEXT NOT NULL,
    "type" "raai_apprendre"."type_etablissement" NOT NULL,
    "mode_identite" "raai_apprendre"."mode_identite" NOT NULL DEFAULT 'minimal',
    "fuseau" TEXT NOT NULL DEFAULT 'Europe/Paris',
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "etablissement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."annee_scolaire" (
    "id" UUID NOT NULL,
    "etablissement_id" UUID NOT NULL,
    "libelle" TEXT NOT NULL,
    "debut" DATE NOT NULL,
    "fin" DATE NOT NULL,

    CONSTRAINT "annee_scolaire_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."offre_formation" (
    "id" UUID NOT NULL,
    "etablissement_id" UUID NOT NULL,
    "diplome_id" UUID NOT NULL,
    "mode_identite" "raai_apprendre"."mode_identite",
    "ouverte_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "offre_formation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."classe" (
    "id" UUID NOT NULL,
    "etablissement_id" UUID NOT NULL,
    "offre_id" UUID NOT NULL,
    "niveau_id" UUID NOT NULL,
    "annee_id" UUID NOT NULL,
    "nom" TEXT NOT NULL,
    "code_rattachement" TEXT NOT NULL,
    "archivee" BOOLEAN NOT NULL DEFAULT false,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "classe_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."apprenant" (
    "id" UUID NOT NULL,
    "etablissement_id" UUID NOT NULL,
    "prenom" TEXT NOT NULL,
    "initiale_nom" VARCHAR(1) NOT NULL DEFAULT '',
    "compte_id" UUID,
    "identifiant" TEXT,
    "code_hash" TEXT,
    "majeur_a_l_inscription" BOOLEAN NOT NULL DEFAULT false,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "vu_le" TIMESTAMPTZ(6),

    CONSTRAINT "apprenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."inscription" (
    "id" UUID NOT NULL,
    "apprenant_id" UUID NOT NULL,
    "classe_id" UUID NOT NULL,
    "etablissement_id" UUID NOT NULL,
    "debut" DATE NOT NULL,
    "fin" DATE,
    "statut" "raai_apprendre"."statut_inscription" NOT NULL DEFAULT 'en_attente',

    CONSTRAINT "inscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."session_apprenant" (
    "jeton" UUID NOT NULL,
    "apprenant_id" UUID NOT NULL,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expire_le" TIMESTAMPTZ(6) NOT NULL,
    "revoquee_le" TIMESTAMPTZ(6),

    CONSTRAINT "session_apprenant_pkey" PRIMARY KEY ("jeton")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."verrou_acces" (
    "identifiant" TEXT NOT NULL,
    "echecs" INTEGER NOT NULL DEFAULT 0,
    "dernier_echec" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verrouille_jusqua" TIMESTAMPTZ(6),

    CONSTRAINT "verrou_acces_pkey" PRIMARY KEY ("identifiant")
);

-- CreateTable
CREATE TABLE "raai_apprendre_ref"."diplome" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "ministere" "raai_apprendre_ref"."ministere" NOT NULL,
    "niveau_europeen" INTEGER NOT NULL,
    "filiere" TEXT NOT NULL,

    CONSTRAINT "diplome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre_ref"."niveau" (
    "id" UUID NOT NULL,
    "diplome_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,

    CONSTRAINT "niveau_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre_ref"."version_referentiel" (
    "id" UUID NOT NULL,
    "diplome_id" UUID NOT NULL,
    "reference_arrete" TEXT NOT NULL,
    "empreinte_source" VARCHAR(64),
    "entree_en_vigueur" DATE NOT NULL,
    "fin_de_validite" DATE,
    "statut" "raai_apprendre_ref"."statut_referentiel" NOT NULL DEFAULT 'brouillon',
    "valide_par_compte_id" UUID,
    "valide_le" TIMESTAMPTZ(6),

    CONSTRAINT "version_referentiel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre_ref"."competence" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "code_bloc" TEXT,
    "intitule" TEXT NOT NULL,
    "parent_id" UUID,
    "ordre" INTEGER NOT NULL,
    "adaptable_localement" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "competence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre_ref"."savoir" (
    "id" UUID NOT NULL,
    "competence_id" UUID NOT NULL,
    "intitule" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,

    CONSTRAINT "savoir_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre_ref"."competence_equivalence" (
    "id" UUID NOT NULL,
    "source_id" UUID NOT NULL,
    "cible_id" UUID NOT NULL,
    "poids" DECIMAL(3,2) NOT NULL DEFAULT 1.0,

    CONSTRAINT "competence_equivalence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."adaptation_locale" (
    "id" UUID NOT NULL,
    "etablissement_id" UUID NOT NULL,
    "competence_id" UUID NOT NULL,
    "intitule" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "adaptation_locale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."matiere" (
    "id" UUID NOT NULL,
    "etablissement_id" UUID,
    "code" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,

    CONSTRAINT "matiere_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."module_formation" (
    "id" UUID NOT NULL,
    "matiere_id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "intitule" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,

    CONSTRAINT "module_formation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."chapitre" (
    "id" UUID NOT NULL,
    "module_id" UUID NOT NULL,
    "titre" TEXT NOT NULL,
    "ordre" INTEGER NOT NULL,

    CONSTRAINT "chapitre_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."lecon" (
    "id" UUID NOT NULL,
    "chapitre_id" UUID NOT NULL,
    "etablissement_id" UUID,
    "titre" TEXT NOT NULL,
    "statut" "raai_apprendre"."statut_publication" NOT NULL DEFAULT 'brouillon',
    "duree_estimee_min" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publiee_le" TIMESTAMPTZ(6),

    CONSTRAINT "lecon_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."bloc_contenu" (
    "id" UUID NOT NULL,
    "lecon_id" UUID NOT NULL,
    "type" "raai_apprendre"."type_bloc" NOT NULL,
    "contenu" JSONB NOT NULL DEFAULT '{}',
    "ordre" INTEGER NOT NULL,
    "genere_par_ia" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "bloc_contenu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."lien_competence" (
    "id" UUID NOT NULL,
    "lecon_id" UUID NOT NULL,
    "competence_id" UUID NOT NULL,

    CONSTRAINT "lien_competence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."ressource" (
    "id" UUID NOT NULL,
    "etablissement_id" UUID,
    "nom" TEXT NOT NULL,
    "type_mime" TEXT NOT NULL,
    "chemin_stockage" TEXT NOT NULL,
    "chemin_apercu" TEXT,
    "taille_octets" BIGINT NOT NULL,
    "licence" TEXT NOT NULL DEFAULT '',
    "statut_traitement" "raai_apprendre"."statut_traitement" NOT NULL DEFAULT 'en_attente',
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ressource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."evaluation" (
    "id" UUID NOT NULL,
    "chapitre_id" UUID NOT NULL,
    "etablissement_id" UUID NOT NULL,
    "titre" TEXT NOT NULL,
    "type" "raai_apprendre"."type_evaluation" NOT NULL,
    "statut" "raai_apprendre"."statut_publication" NOT NULL DEFAULT 'brouillon',
    "duree_max_min" INTEGER,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."question" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "type" "raai_apprendre"."type_question" NOT NULL,
    "enonce" TEXT NOT NULL,
    "options" JSONB NOT NULL DEFAULT '[]',
    "corrige" JSONB NOT NULL DEFAULT '{}',
    "bareme" DECIMAL(5,2) NOT NULL DEFAULT 1.0,
    "ordre" INTEGER NOT NULL,
    "genere_par_ia" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "question_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."tentative" (
    "id" UUID NOT NULL,
    "evaluation_id" UUID NOT NULL,
    "apprenant_id" UUID NOT NULL,
    "etablissement_id" UUID NOT NULL,
    "revise_id" UUID,
    "statut" "raai_apprendre"."statut_tentative" NOT NULL DEFAULT 'en_cours',
    "score" DECIMAL(6,2),
    "score_max" DECIMAL(6,2),
    "duree_secondes" INTEGER NOT NULL DEFAULT 0,
    "changements_onglet" INTEGER NOT NULL DEFAULT 0,
    "cle_idempotence" TEXT,
    "cree_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "soumise_le" TIMESTAMPTZ(6),

    CONSTRAINT "tentative_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."reponse" (
    "id" UUID NOT NULL,
    "tentative_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "valeur" JSONB NOT NULL DEFAULT '{}',
    "score" DECIMAL(6,2),
    "commentaire" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "reponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."acquis_competence" (
    "id" UUID NOT NULL,
    "apprenant_id" UUID NOT NULL,
    "competence_id" UUID NOT NULL,
    "version_referentiel_id" UUID NOT NULL,
    "etablissement_id" UUID NOT NULL,
    "niveau" "raai_apprendre"."niveau_acquisition" NOT NULL DEFAULT 'non_abordee',
    "score" DECIMAL(5,2),
    "origine" "raai_apprendre"."origine_acquis" NOT NULL,
    "source_id" UUID,
    "constate_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "acquis_competence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."presence_jour" (
    "apprenant_id" UUID NOT NULL,
    "etablissement_id" UUID NOT NULL,
    "jour" DATE NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "presence_jour_pkey" PRIMARY KEY ("apprenant_id","jour")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."evenement_domaine" (
    "id" UUID NOT NULL,
    "type" TEXT NOT NULL,
    "charge" JSONB NOT NULL,
    "etablissement_id" UUID,
    "survenu_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "traite_le" TIMESTAMPTZ(6),

    CONSTRAINT "evenement_domaine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre_audit"."evenement" (
    "id" UUID NOT NULL,
    "sujet_id" UUID,
    "sujet_type" TEXT NOT NULL,
    "role_effectif" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "ressource_type" TEXT NOT NULL,
    "ressource_id" UUID,
    "etablissement_id" UUID,
    "id_requete" TEXT NOT NULL,
    "ip_tronquee" TEXT,
    "survenu_le" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evenement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raai_apprendre"."quota_ia" (
    "etablissement_id" UUID NOT NULL,
    "mois" VARCHAR(7) NOT NULL,
    "utilises" INTEGER NOT NULL DEFAULT 0,
    "plafond" INTEGER NOT NULL DEFAULT 500,
    "cout_centimes" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "quota_ia_pkey" PRIMARY KEY ("etablissement_id","mois")
);

-- CreateIndex
CREATE UNIQUE INDEX "compte_email_key" ON "raai_apprendre"."compte"("email");

-- CreateIndex
CREATE INDEX "membre_etablissement_id_role_idx" ON "raai_apprendre"."membre"("etablissement_id", "role");

-- CreateIndex
CREATE UNIQUE INDEX "membre_compte_id_role_etablissement_id_academie_id_key" ON "raai_apprendre"."membre"("compte_id", "role", "etablissement_id", "academie_id");

-- CreateIndex
CREATE INDEX "affectation_classe_id_idx" ON "raai_apprendre"."affectation"("classe_id");

-- CreateIndex
CREATE UNIQUE INDEX "affectation_membre_id_classe_id_matiere_id_key" ON "raai_apprendre"."affectation"("membre_id", "classe_id", "matiere_id");

-- CreateIndex
CREATE INDEX "consentement_apprenant_id_idx" ON "raai_apprendre"."consentement"("apprenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "pays_code_key" ON "raai_apprendre"."pays"("code");

-- CreateIndex
CREATE UNIQUE INDEX "academie_code_key" ON "raai_apprendre"."academie"("code");

-- CreateIndex
CREATE UNIQUE INDEX "etablissement_uai_key" ON "raai_apprendre"."etablissement"("uai");

-- CreateIndex
CREATE INDEX "etablissement_academie_id_idx" ON "raai_apprendre"."etablissement"("academie_id");

-- CreateIndex
CREATE UNIQUE INDEX "annee_scolaire_etablissement_id_libelle_key" ON "raai_apprendre"."annee_scolaire"("etablissement_id", "libelle");

-- CreateIndex
CREATE UNIQUE INDEX "offre_formation_etablissement_id_diplome_id_key" ON "raai_apprendre"."offre_formation"("etablissement_id", "diplome_id");

-- CreateIndex
CREATE UNIQUE INDEX "classe_code_rattachement_key" ON "raai_apprendre"."classe"("code_rattachement");

-- CreateIndex
CREATE INDEX "classe_etablissement_id_archivee_idx" ON "raai_apprendre"."classe"("etablissement_id", "archivee");

-- CreateIndex
CREATE INDEX "classe_annee_id_idx" ON "raai_apprendre"."classe"("annee_id");

-- CreateIndex
CREATE UNIQUE INDEX "apprenant_compte_id_key" ON "raai_apprendre"."apprenant"("compte_id");

-- CreateIndex
CREATE UNIQUE INDEX "apprenant_identifiant_key" ON "raai_apprendre"."apprenant"("identifiant");

-- CreateIndex
CREATE INDEX "apprenant_etablissement_id_actif_idx" ON "raai_apprendre"."apprenant"("etablissement_id", "actif");

-- CreateIndex
CREATE INDEX "inscription_classe_id_statut_idx" ON "raai_apprendre"."inscription"("classe_id", "statut");

-- CreateIndex
CREATE INDEX "inscription_apprenant_id_idx" ON "raai_apprendre"."inscription"("apprenant_id");

-- CreateIndex
CREATE INDEX "session_apprenant_apprenant_id_idx" ON "raai_apprendre"."session_apprenant"("apprenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "diplome_code_key" ON "raai_apprendre_ref"."diplome"("code");

-- CreateIndex
CREATE UNIQUE INDEX "niveau_diplome_id_code_key" ON "raai_apprendre_ref"."niveau"("diplome_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "version_referentiel_diplome_id_reference_arrete_key" ON "raai_apprendre_ref"."version_referentiel"("diplome_id", "reference_arrete");

-- CreateIndex
CREATE INDEX "competence_parent_id_idx" ON "raai_apprendre_ref"."competence"("parent_id");

-- CreateIndex
CREATE UNIQUE INDEX "competence_version_id_code_key" ON "raai_apprendre_ref"."competence"("version_id", "code");

-- CreateIndex
CREATE INDEX "savoir_competence_id_idx" ON "raai_apprendre_ref"."savoir"("competence_id");

-- CreateIndex
CREATE UNIQUE INDEX "competence_equivalence_source_id_cible_id_key" ON "raai_apprendre_ref"."competence_equivalence"("source_id", "cible_id");

-- CreateIndex
CREATE UNIQUE INDEX "adaptation_locale_etablissement_id_competence_id_key" ON "raai_apprendre"."adaptation_locale"("etablissement_id", "competence_id");

-- CreateIndex
CREATE UNIQUE INDEX "matiere_etablissement_id_code_key" ON "raai_apprendre"."matiere"("etablissement_id", "code");

-- CreateIndex
CREATE INDEX "module_formation_matiere_id_idx" ON "raai_apprendre"."module_formation"("matiere_id");

-- CreateIndex
CREATE INDEX "chapitre_module_id_idx" ON "raai_apprendre"."chapitre"("module_id");

-- CreateIndex
CREATE INDEX "lecon_chapitre_id_statut_id_idx" ON "raai_apprendre"."lecon"("chapitre_id", "statut", "id");

-- CreateIndex
CREATE INDEX "lecon_etablissement_id_idx" ON "raai_apprendre"."lecon"("etablissement_id");

-- CreateIndex
CREATE INDEX "bloc_contenu_lecon_id_ordre_idx" ON "raai_apprendre"."bloc_contenu"("lecon_id", "ordre");

-- CreateIndex
CREATE INDEX "lien_competence_competence_id_lecon_id_idx" ON "raai_apprendre"."lien_competence"("competence_id", "lecon_id");

-- CreateIndex
CREATE UNIQUE INDEX "lien_competence_lecon_id_competence_id_key" ON "raai_apprendre"."lien_competence"("lecon_id", "competence_id");

-- CreateIndex
CREATE INDEX "ressource_etablissement_id_idx" ON "raai_apprendre"."ressource"("etablissement_id");

-- CreateIndex
CREATE INDEX "evaluation_chapitre_id_statut_idx" ON "raai_apprendre"."evaluation"("chapitre_id", "statut");

-- CreateIndex
CREATE INDEX "question_evaluation_id_ordre_idx" ON "raai_apprendre"."question"("evaluation_id", "ordre");

-- CreateIndex
CREATE UNIQUE INDEX "tentative_cle_idempotence_key" ON "raai_apprendre"."tentative"("cle_idempotence");

-- CreateIndex
CREATE INDEX "tentative_apprenant_id_evaluation_id_cree_le_idx" ON "raai_apprendre"."tentative"("apprenant_id", "evaluation_id", "cree_le" DESC);

-- CreateIndex
CREATE INDEX "tentative_etablissement_id_cree_le_idx" ON "raai_apprendre"."tentative"("etablissement_id", "cree_le");

-- CreateIndex
CREATE UNIQUE INDEX "reponse_tentative_id_question_id_key" ON "raai_apprendre"."reponse"("tentative_id", "question_id");

-- CreateIndex
CREATE INDEX "acquis_competence_apprenant_id_competence_id_idx" ON "raai_apprendre"."acquis_competence"("apprenant_id", "competence_id");

-- CreateIndex
CREATE INDEX "acquis_competence_etablissement_id_competence_id_idx" ON "raai_apprendre"."acquis_competence"("etablissement_id", "competence_id");

-- CreateIndex
CREATE UNIQUE INDEX "acquis_competence_apprenant_id_competence_id_version_refere_key" ON "raai_apprendre"."acquis_competence"("apprenant_id", "competence_id", "version_referentiel_id");

-- CreateIndex
CREATE INDEX "presence_jour_etablissement_id_jour_idx" ON "raai_apprendre"."presence_jour"("etablissement_id", "jour");

-- CreateIndex
CREATE INDEX "evenement_domaine_type_traite_le_idx" ON "raai_apprendre"."evenement_domaine"("type", "traite_le");

-- CreateIndex
CREATE INDEX "evenement_etablissement_id_survenu_le_idx" ON "raai_apprendre_audit"."evenement"("etablissement_id", "survenu_le");

-- CreateIndex
CREATE INDEX "evenement_sujet_id_survenu_le_idx" ON "raai_apprendre_audit"."evenement"("sujet_id", "survenu_le");

-- AddForeignKey
ALTER TABLE "raai_apprendre"."membre" ADD CONSTRAINT "membre_compte_id_fkey" FOREIGN KEY ("compte_id") REFERENCES "raai_apprendre"."compte"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."membre" ADD CONSTRAINT "membre_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "raai_apprendre"."etablissement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."membre" ADD CONSTRAINT "membre_academie_id_fkey" FOREIGN KEY ("academie_id") REFERENCES "raai_apprendre"."academie"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."affectation" ADD CONSTRAINT "affectation_membre_id_fkey" FOREIGN KEY ("membre_id") REFERENCES "raai_apprendre"."membre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."affectation" ADD CONSTRAINT "affectation_classe_id_fkey" FOREIGN KEY ("classe_id") REFERENCES "raai_apprendre"."classe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."affectation" ADD CONSTRAINT "affectation_matiere_id_fkey" FOREIGN KEY ("matiere_id") REFERENCES "raai_apprendre"."matiere"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."consentement" ADD CONSTRAINT "consentement_compte_id_fkey" FOREIGN KEY ("compte_id") REFERENCES "raai_apprendre"."compte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."consentement" ADD CONSTRAINT "consentement_apprenant_id_fkey" FOREIGN KEY ("apprenant_id") REFERENCES "raai_apprendre"."apprenant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."academie" ADD CONSTRAINT "academie_pays_id_fkey" FOREIGN KEY ("pays_id") REFERENCES "raai_apprendre"."pays"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."etablissement" ADD CONSTRAINT "etablissement_academie_id_fkey" FOREIGN KEY ("academie_id") REFERENCES "raai_apprendre"."academie"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."annee_scolaire" ADD CONSTRAINT "annee_scolaire_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "raai_apprendre"."etablissement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."offre_formation" ADD CONSTRAINT "offre_formation_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "raai_apprendre"."etablissement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."offre_formation" ADD CONSTRAINT "offre_formation_diplome_id_fkey" FOREIGN KEY ("diplome_id") REFERENCES "raai_apprendre_ref"."diplome"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."classe" ADD CONSTRAINT "classe_offre_id_fkey" FOREIGN KEY ("offre_id") REFERENCES "raai_apprendre"."offre_formation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."classe" ADD CONSTRAINT "classe_niveau_id_fkey" FOREIGN KEY ("niveau_id") REFERENCES "raai_apprendre_ref"."niveau"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."classe" ADD CONSTRAINT "classe_annee_id_fkey" FOREIGN KEY ("annee_id") REFERENCES "raai_apprendre"."annee_scolaire"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."apprenant" ADD CONSTRAINT "apprenant_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "raai_apprendre"."etablissement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."apprenant" ADD CONSTRAINT "apprenant_compte_id_fkey" FOREIGN KEY ("compte_id") REFERENCES "raai_apprendre"."compte"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."inscription" ADD CONSTRAINT "inscription_apprenant_id_fkey" FOREIGN KEY ("apprenant_id") REFERENCES "raai_apprendre"."apprenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."inscription" ADD CONSTRAINT "inscription_classe_id_fkey" FOREIGN KEY ("classe_id") REFERENCES "raai_apprendre"."classe"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."session_apprenant" ADD CONSTRAINT "session_apprenant_apprenant_id_fkey" FOREIGN KEY ("apprenant_id") REFERENCES "raai_apprendre"."apprenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre_ref"."niveau" ADD CONSTRAINT "niveau_diplome_id_fkey" FOREIGN KEY ("diplome_id") REFERENCES "raai_apprendre_ref"."diplome"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre_ref"."version_referentiel" ADD CONSTRAINT "version_referentiel_diplome_id_fkey" FOREIGN KEY ("diplome_id") REFERENCES "raai_apprendre_ref"."diplome"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre_ref"."competence" ADD CONSTRAINT "competence_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "raai_apprendre_ref"."version_referentiel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre_ref"."competence" ADD CONSTRAINT "competence_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "raai_apprendre_ref"."competence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre_ref"."savoir" ADD CONSTRAINT "savoir_competence_id_fkey" FOREIGN KEY ("competence_id") REFERENCES "raai_apprendre_ref"."competence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre_ref"."competence_equivalence" ADD CONSTRAINT "competence_equivalence_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "raai_apprendre_ref"."competence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre_ref"."competence_equivalence" ADD CONSTRAINT "competence_equivalence_cible_id_fkey" FOREIGN KEY ("cible_id") REFERENCES "raai_apprendre_ref"."competence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."adaptation_locale" ADD CONSTRAINT "adaptation_locale_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "raai_apprendre"."etablissement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."adaptation_locale" ADD CONSTRAINT "adaptation_locale_competence_id_fkey" FOREIGN KEY ("competence_id") REFERENCES "raai_apprendre_ref"."competence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."matiere" ADD CONSTRAINT "matiere_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "raai_apprendre"."etablissement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."module_formation" ADD CONSTRAINT "module_formation_matiere_id_fkey" FOREIGN KEY ("matiere_id") REFERENCES "raai_apprendre"."matiere"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."chapitre" ADD CONSTRAINT "chapitre_module_id_fkey" FOREIGN KEY ("module_id") REFERENCES "raai_apprendre"."module_formation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."lecon" ADD CONSTRAINT "lecon_chapitre_id_fkey" FOREIGN KEY ("chapitre_id") REFERENCES "raai_apprendre"."chapitre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."lecon" ADD CONSTRAINT "lecon_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "raai_apprendre"."etablissement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."bloc_contenu" ADD CONSTRAINT "bloc_contenu_lecon_id_fkey" FOREIGN KEY ("lecon_id") REFERENCES "raai_apprendre"."lecon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."lien_competence" ADD CONSTRAINT "lien_competence_lecon_id_fkey" FOREIGN KEY ("lecon_id") REFERENCES "raai_apprendre"."lecon"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."lien_competence" ADD CONSTRAINT "lien_competence_competence_id_fkey" FOREIGN KEY ("competence_id") REFERENCES "raai_apprendre_ref"."competence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."ressource" ADD CONSTRAINT "ressource_etablissement_id_fkey" FOREIGN KEY ("etablissement_id") REFERENCES "raai_apprendre"."etablissement"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."evaluation" ADD CONSTRAINT "evaluation_chapitre_id_fkey" FOREIGN KEY ("chapitre_id") REFERENCES "raai_apprendre"."chapitre"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."question" ADD CONSTRAINT "question_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "raai_apprendre"."evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."tentative" ADD CONSTRAINT "tentative_evaluation_id_fkey" FOREIGN KEY ("evaluation_id") REFERENCES "raai_apprendre"."evaluation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."tentative" ADD CONSTRAINT "tentative_apprenant_id_fkey" FOREIGN KEY ("apprenant_id") REFERENCES "raai_apprendre"."apprenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."reponse" ADD CONSTRAINT "reponse_tentative_id_fkey" FOREIGN KEY ("tentative_id") REFERENCES "raai_apprendre"."tentative"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."reponse" ADD CONSTRAINT "reponse_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "raai_apprendre"."question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."acquis_competence" ADD CONSTRAINT "acquis_competence_apprenant_id_fkey" FOREIGN KEY ("apprenant_id") REFERENCES "raai_apprendre"."apprenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."acquis_competence" ADD CONSTRAINT "acquis_competence_competence_id_fkey" FOREIGN KEY ("competence_id") REFERENCES "raai_apprendre_ref"."competence"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."acquis_competence" ADD CONSTRAINT "acquis_competence_version_referentiel_id_fkey" FOREIGN KEY ("version_referentiel_id") REFERENCES "raai_apprendre_ref"."version_referentiel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raai_apprendre"."presence_jour" ADD CONSTRAINT "presence_jour_apprenant_id_fkey" FOREIGN KEY ("apprenant_id") REFERENCES "raai_apprendre"."apprenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

