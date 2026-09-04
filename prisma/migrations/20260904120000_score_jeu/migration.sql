-- Scores des jeux d'entraînement.
--
-- Jusqu'ici gardés dans le navigateur : un score ne suivait pas l'élève d'un
-- poste à l'autre, et ne nourrissait pas la progression. Une ligne par partie
-- terminée — on garde l'historique, le « meilleur » est une lecture. La clé du
-- jeu est celle du fichier `contenu/jeux/*.json`, pas une clé étrangère : les
-- jeux sont du contenu national lu au build, sans table.

CREATE TABLE "raai_apprendre"."score_jeu" (
  "id"               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "apprenant_id"     UUID NOT NULL
    REFERENCES "raai_apprendre"."apprenant"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "etablissement_id" UUID NOT NULL,
  "jeu"              TEXT NOT NULL,
  "score"            INTEGER NOT NULL,
  "score_max"        INTEGER NOT NULL,
  -- Redondante avec score / score_max, mais c'est elle que la progression
  -- lit et que le seuil compare : une lecture ne doit pas refaire la division.
  "part"             NUMERIC(5, 4) NOT NULL,
  "joue_le"          TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "score_jeu_score_positif" CHECK ("score" >= 0 AND "score_max" > 0),
  CONSTRAINT "score_jeu_part_bornee"  CHECK ("part" >= 0 AND "part" <= 1)
);

CREATE INDEX "score_jeu_apprenant_id_jeu_idx"
  ON "raai_apprendre"."score_jeu"("apprenant_id", "jeu");

-- `etablissement_id` en tête : c'est le prédicat que la politique ajoute.
CREATE INDEX "score_jeu_etablissement_id_joue_le_idx"
  ON "raai_apprendre"."score_jeu"("etablissement_id", "joue_le");

ALTER TABLE "raai_apprendre"."score_jeu" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "raai_apprendre"."score_jeu" FORCE ROW LEVEL SECURITY;

-- Même politique que `tentative` : un apprenant ne voit QUE ses scores, un
-- encadrant ceux des élèves de ses classes, et rien ne s'écrit hors de
-- l'établissement courant.
DROP POLICY IF EXISTS score_jeu_apprenant ON raai_apprendre.score_jeu;
CREATE POLICY score_jeu_apprenant ON raai_apprendre.score_jeu FOR ALL
  USING (
    apprenant_id = raai_apprendre.apprenant_courant()
    OR (
      etablissement_id = raai_apprendre.etablissement_courant()
      AND EXISTS (
        SELECT 1 FROM raai_apprendre.inscription i
         WHERE i.apprenant_id = score_jeu.apprenant_id
           AND i.classe_id IN (SELECT raai_apprendre.classes_du_sujet())
      )
    )
  )
  WITH CHECK (etablissement_id = raai_apprendre.etablissement_courant());

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
