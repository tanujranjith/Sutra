// Shared by artifact staging and verification. Paths are repository-relative;
// licenses may ship with vendor code, contributor material and local files may not.
const entries = new Set([
  'index.html', 'homepage.html', 'sutra.html', '404.html', 'oauth-callback.html',
  'manifest.webmanifest', 'robots.txt', 'sitemap.xml', 'sw.js', 'license'
]);
const trees = ['styles', 'src', 'assets/brand/sutra/generated', 'assets/vendor', 'assets/marketing/screenshots'];
const developmentDirectories = new Set([
  'node_modules', 'tests', '__tests__', '__mocks__', '__fixtures__', 'fixtures',
  'scripts', 'docs', 'examples', 'test-results', 'noteflow-classic'
]);

export function getDeployPathProblem(relativePath, { isDirectory = false, isSymbolicLink = false } = {}) {
  const path = String(relativePath).replace(/\\/g, '/').toLowerCase();
  const parts = path.split('/');
  if (!path || parts.some(part => !part || part === '..' || part.startsWith('.')) || /^[a-z]:/.test(path)) return 'hidden or invalid path';
  if (isSymbolicLink) return 'symbolic link';
  if (parts.some(part => developmentDirectories.has(part))) return 'development directory';
  const inTree = trees.some(tree => path === tree || path.startsWith(tree + '/'));
  const treeParent = isDirectory && trees.some(tree => tree.startsWith(path + '/'));
  if (!inTree && !treeParent && !(entries.has(path) && !isDirectory)) return 'outside the runtime allowlist';
  if (isDirectory) return null;
  const name = parts.at(-1);
  if (/\.(?:env|sql|map|pem|key|p12|pfx|jks|keystore|db|sqlite3?|log|bak|tmp|ts|tsx|jsx|ya?ml|toml)$/i.test(name)) return 'non-runtime or sensitive file';
  if (/^(?:package(?:-lock)?\.json|yarn\.lock|npm-shrinkwrap\.json)$/i.test(name)) return 'package metadata';
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/i.test(name) || /(?:^|[-_.])fixtures?(?:[-_.]|$)/i.test(name)) return 'test material';
  if (/\.(?:md|markdown)$/i.test(name) && !/^(?:license|notice|copying)(?:[._-]|$)/i.test(name)) return 'contributor documentation';
  return null;
}
