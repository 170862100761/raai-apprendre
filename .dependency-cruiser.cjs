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
        "On importe l'index.ts d'un module, jamais son intérieur. " +
        'Sinon la surface publique ne veut plus rien dire.',
      from: { path: '^src/domaines/([^/]+)/', pathNot: '^src/domaines/$1/' },
      to: {
        path: '^src/domaines/([^/]+)/(.+)',
        pathNot: ['^src/domaines/([^/]+)/index\\.ts$'],
      },
    },
    {
      name: 'domaine-sans-infrastructure',
      severity: 'error',
      comment:
        'La couche domaine ne dépend de rien : ni infrastructure, ni application, ' +
        'ni librairie tierce. Les flèches pointent vers le centre.',
      from: { path: '^src/domaines/[^/]+/domaine/' },
      to: {
        pathNot: ['^src/domaines/[^/]+/domaine/', '^src/noyau/'],
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
