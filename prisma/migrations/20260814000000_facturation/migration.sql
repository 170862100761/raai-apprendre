-- Facturation : abonnement Stripe par sièges, et idempotence des webhooks.
--
-- Stripe est la source de vérité du paiement ; `abonnement` n'en est que la
-- projection locale. Elle ne s'écrit que depuis le webhook signé ou la
-- création du client — jamais depuis un écran.

CREATE TYPE "raai_apprendre"."statut_abonnement" AS ENUM (
  'inexistant', 'active', 'impayee', 'annulee'
);

CREATE TABLE "raai_apprendre"."abonnement" (
  "id"                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "etablissement_id"     UUID NOT NULL UNIQUE
    REFERENCES "raai_apprendre"."etablissement"("id"),
  "stripe_client_id"     TEXT UNIQUE,
  "stripe_abonnement_id" TEXT UNIQUE,
  "statut"               "raai_apprendre"."statut_abonnement" NOT NULL DEFAULT 'inexistant',
  "sieges"               INTEGER NOT NULL DEFAULT 0,
  "periode_fin_le"       TIMESTAMPTZ(6),
  "maj_le"               TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

CREATE TABLE "raai_apprendre"."evenement_paiement" (
  "id"      TEXT PRIMARY KEY,
  "recu_le" TIMESTAMPTZ(6) NOT NULL DEFAULT now()
);

ALTER TABLE "raai_apprendre"."abonnement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "raai_apprendre"."abonnement" FORCE ROW LEVEL SECURITY;
ALTER TABLE "raai_apprendre"."evenement_paiement" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "raai_apprendre"."evenement_paiement" FORCE ROW LEVEL SECURITY;

-- L'administrateur de l'établissement LIT son abonnement — c'est son écran de
-- gestion. Personne n'écrit par PostgREST : l'écriture appartient au serveur
-- (webhook signé), qui passe hors RLS.
CREATE POLICY abonnement_lecture_etablissement ON "raai_apprendre"."abonnement"
  FOR SELECT USING (
    etablissement_id = raai_apprendre.etablissement_courant()
    AND raai_apprendre.a_role(ARRAY['admin_etablissement']::raai_apprendre.role[])
  );

-- Table technique : aucun accès par l'API, même en lecture — le motif est
-- celui de `session_apprenant`.
CREATE POLICY evenement_paiement_aucune ON "raai_apprendre"."evenement_paiement"
  FOR ALL USING (false) WITH CHECK (false);

-- Le garde-fou, à chaque migration : il doit se déclencher au plus près du
-- changement, pas seulement en CI.
DO $$
DECLARE manquantes text[];
BEGIN
  SELECT array_agg(format('%s.%s', c.relnamespace::regnamespace, c.relname))
    INTO manquantes
    FROM pg_class c
   WHERE c.relnamespace::regnamespace::text
         IN ('raai_apprendre', 'raai_apprendre_ref', 'raai_apprendre_audit')
     AND c.relkind = 'r'
     AND c.relname <> '_prisma_migrations'
     AND NOT EXISTS (SELECT 1 FROM pg_policy p WHERE p.polrelid = c.oid);

  IF manquantes IS NOT NULL THEN
    RAISE EXCEPTION
      'Tables sans politique RLS : %. Une table sans politique est une fuite en attente.',
      array_to_string(manquantes, ', ');
  END IF;
END $$;
