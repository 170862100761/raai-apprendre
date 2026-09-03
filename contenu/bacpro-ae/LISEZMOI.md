# Contenu du Bac Pro Agroéquipement — un fichier par module

Ce dossier porte la matière pédagogique d'Apprendre pour le Bac Pro
Agroéquipement, en JSON relisible et versionné. `outils/importer-contenu.mjs`
le pose en base (idempotent : relancer met à jour sans dupliquer).

**Tout ce qui est ici est généré par IA et attend la relecture d'un
enseignant d'agroéquipement.** Les leçons sont importées *publiées* parce que
Raphaël a demandé de la matière visible ; un enseignant peut les repasser en
brouillon ou les archiver depuis l'espace formateur.

## Format d'un fichier `<module>.json`

```json
{
  "module": { "code": "MP5", "intitule": "Choix d'un équipement dans un contexte de transitions", "matiere": "AGROEQ", "ordre": 5 },
  "chapitres": [
    {
      "titre": "Le contexte d'une opération culturale",
      "ordre": 1,
      "lecons": [
        {
          "cle": "mp5-01-01",
          "titre": "Lire une parcelle avant d'y entrer : sol, climat, plante",
          "capacites": ["C5.1"],
          "blocs": [
            { "type": "texte", "texte": "Pourquoi commencer par le sol\nUn tracteur de 150 ch …" }
          ],
          "quiz": {
            "titre": "Pour vérifier — Lire une parcelle",
            "questions": [
              { "type": "qcm", "enonce": "…", "propositions": ["…", "…", "…", "…"], "bonnes": [1], "bareme": 2, "explication": "…" },
              { "type": "vrai_faux", "enonce": "…", "bonne": false, "bareme": 1, "explication": "…" },
              { "type": "numerique", "enonce": "…", "unite": "ha/h", "valeur": 2.7, "tolerance": 0.1, "bareme": 2, "explication": "…" },
              { "type": "texte_court", "enonce": "…", "acceptees": ["…", "…"], "bareme": 1, "explication": "…" }
            ]
          }
        }
      ]
    }
  ]
}
```

Règles :

- `matiere` : `AGROEQ` (enseignements professionnels, modules MP5 à MP9 et
  MAP) ou `GENERAL` (enseignements généraux, modules MG1 à MG4). L'ordre du
  module ordonne le parcours de l'élève : MG1 = 1 … MG4 = 4, MP5 = 5 … MP9 = 9,
  MAP = 10.
- `cle` : unique dans tout le dossier, minuscules, `module-chapitre-leçon`.
- `capacites` : codes du référentiel 2024 (`docs/referentiel/…json`), rang 2
  de préférence (`C5.1`), rang 1 accepté (`C10`). Chaque leçon en a au moins une.
- `blocs` : des blocs `texte` seulement. Un bloc = un paragraphe ou une
  courte section ; sa première ligne peut être un intertitre, suivi d'un saut
  de ligne. Un encadré s'écrit `Sécurité : …`, `Astuce : …`, `À retenir : …`.
  Entre 6 et 9 blocs de 80 à 180 mots : une leçon se lit en 8 à 14 minutes.
- `quiz` : 5 à 6 questions, au moins trois types différents, qui portent sur
  ce que la leçon vient de dire. `bonnes` désigne des index de `propositions`
  (plusieurs possibles). L'`explication` dit pourquoi, en une ou deux phrases,
  sans se contenter de répéter la bonne réponse. L'importateur mélange les
  propositions : la bonne réponse peut être écrite en tête.
- Français partout, niveau Bac Pro, vocabulaire du métier, unités SI, chiffres
  réalistes. Aucune marque commerciale nommée comme référence.
