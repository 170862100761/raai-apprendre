/**
 * La matrice de dépendances du document 01 est ce fichier, pas un schéma
 * décoratif : une flèche non déclarée casse le build.
 *
 * Deux règles portent tout le découplage :
 *   - un module n'expose que son index.ts ;
 *   - le domaine n'importe jamais d'infrastructure.
 */

/** Dépendances directes autorisées entre modules (doc 01 §3). */
const AUTORISE = {
  identite: [],
  organisation: ['identite'],
  referentiel: [],
  catalogue: ['referentiel', 'mediatheque'],
  mediatheque: [],
  evaluation: ['catalogue'],
  progression: ['evaluation', 'referentiel'],
  // Scores des jeux : supprimable d'un bloc, ne parle qu'a la progression.
  jeux: ['progression', 'identite'],
  gamification: [],
  'assistance-ia': [],
  notification: [],
  facturation: ['organisation'],
  audit: [],
  recherche: [],
}

/** `catalogue` ne peut pas importer `progression`, etc. */
const interdits = Object.entries(AUTORISE).map(([module, permis]) => ({
  name: `module-${module}-hors-matrice`,
  severity: 'error',
  comment:
    `Le module « ${module} » ne peut dépendre que de : ${permis.join(', ') || '(aucun)'}. ` +
    `Pour communiquer avec un autre module, publie un événement de domaine.`,
  from: { path: `^src/domaines/${module}/` },
  to: {
    path: '^src/domaines/([^/]+)/',
    pathNot: [`^src/domaines/(${[module, ...permis].join('|')})/`],
  },
}))

module.exports = {
  forbidden: [
    ...interdits,
    {
      name: 'module-surface-publique',
      severity: 'error',
      comment:
        "On importe l'index.ts d'un AUTRE module, jamais son intérieur. " +
        'Sinon la surface publique ne veut plus rien dire. À l\'intérieur d\'un ' +
        'module, en revanche, les couches s\'importent librement.',
      // `$1` reprend le nom de module capturé dans `from` : la règle ne vise
      // donc que les imports d'un module vers un autre.
      from: { path: '^src/domaines/([^/]+)/' },
      to: {
        path: '^src/domaines/([^/]+)/',
        pathNot: ['^src/domaines/$1/', '^src/domaines/[^/]+/index\\.ts$'],
      },
    },
    {
      name: 'domaine-sans-infrastructure',
      severity: 'error',
      comment:
        'La couche domaine ne dépend ni de son infrastructure, ni de son ' +
        'application, ni d\'un framework. Les flèches pointent vers le centre.\n' +
        'Seule tolérance : `zod`. Les schémas de blocs SONT le modèle de ' +
        'domaine — ce qu\'est un bloc valide est une règle métier, pas un détail ' +
        'de sérialisation. Zod est une librairie de valeurs pures, sans E/S ni ' +
        'état, au même titre qu\'une bibliothèque de dates. Cette tolérance est ' +
        'nominative : elle ne s\'étend à aucune autre dépendance.',
      // Les tests du domaine sont exclus : ils importent vitest, et c'est leur
      // rôle. C'est le code de production qui doit rester pur.
      from: { path: '^src/domaines/[^/]+/domaine/', pathNot: '\\.test\\.ts$' },
      to: {
        pathNot: ['^src/domaines/[^/]+/domaine/', '^src/noyau/', '^node_modules/zod/'],
      },
    },
    {
      name: 'application-sans-infrastructure',
      severity: 'error',
      comment:
        "La couche application dépend de ports, jamais d'implémentations. " +
        "L'infrastructure est injectée.",
      from: { path: '^src/domaines/[^/]+/application/' },
      to: { path: '^src/domaines/[^/]+/infrastructure/' },
    },
    {
      name: 'domaines-sans-presentation',
      severity: 'error',
      comment: "Un module métier n'importe jamais l'App Router.",
      from: { path: '^src/domaines/' },
      to: { path: '^src/app/' },
    },
    {
      name: 'pas-de-cycle',
      severity: 'error',
      comment: 'Dépendance circulaire.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'pas-d-orphelin',
      severity: 'warn',
      from: { orphan: true, pathNot: ['\\.d\\.ts$', '(^|/)(next|eslint|vitest)\\.config\\.'] },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require'] },
  },
}
