-- Explication d'une question : pourquoi c'est la bonne réponse. Elle vit à
-- côté du corrigé et suit la même règle : jamais servie avec l'énoncé, montrée
-- seulement après soumission. Un élève qui se trompe voyait une croix ; il
-- lit maintenant un « pourquoi ».
ALTER TABLE "raai_apprendre"."question" ADD COLUMN "explication" TEXT;
