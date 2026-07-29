-- Date de rendu d'une évaluation.
--
-- Colonne ajoutée à une table existante : `evaluation` porte déjà sa politique
-- de cloisonnement par établissement, et une colonne n'échappe pas à la
-- politique de sa table. Rien de nouveau à autoriser.
--
-- NULL est la valeur par défaut, et le restera pour l'essentiel du contenu :
-- une échéance ne se déduit pas, elle se décide. La poser d'office à la
-- création reviendrait à inventer des retards.

ALTER TABLE "raai_apprendre"."evaluation"
  ADD COLUMN IF NOT EXISTS "echeance_le" TIMESTAMPTZ(6);

-- `etablissement_id` en tête : la politique ajoute systématiquement ce
-- prédicat, un index qui ne le porte pas en premier ne serait pas utilisé.
CREATE INDEX IF NOT EXISTS "evaluation_etablissement_id_echeance_le_idx"
  ON "raai_apprendre"."evaluation"("etablissement_id", "echeance_le");

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
