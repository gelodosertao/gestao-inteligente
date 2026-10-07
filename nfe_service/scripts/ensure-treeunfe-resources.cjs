const fs = require('node:fs');
const path = require('node:path');

if (process.platform === 'win32') {
  // @treeunfe/shared 2.4.0 matches "@treeunfe/shared" literally when locating
  // package resources. Windows paths use a backslash, so its fallback points
  // to node_modules/resources instead of @treeunfe/shared/resources.
  const packageRoot = path.resolve(path.dirname(require.resolve('@treeunfe/shared')), '..');
  const targetRoot = path.resolve(packageRoot, '..', '..', 'resources');
  for (const folder of ['schemas', 'certs']) {
    const source = path.join(packageRoot, 'resources', folder);
    const target = path.join(targetRoot, folder);
    if (!fs.statSync(source).isDirectory()) throw new Error(`Recursos fiscais ausentes: ${source}`);
    fs.cpSync(source, target, { recursive: true, force: true });
  }
  fs.accessSync(path.join(targetRoot, 'schemas', 'enviNFe_v4.00.xsd'));
  console.log('[treeunfe] Schemas e certificados disponíveis para validação no Windows.');
}
