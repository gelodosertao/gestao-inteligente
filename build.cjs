const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const isWindows = process.platform === 'win32';
const binName = (name) => `${name}${isWindows ? '.cmd' : ''}`;
const localBin = (cwd, name) => path.join(cwd, 'node_modules', '.bin', binName(name));

function run(command, options = {}) {
  execSync(command, { stdio: 'inherit', ...options });
}

function assertLocalCommand(cwd, name) {
  const commandPath = localBin(cwd, name);
  if (!fs.existsSync(commandPath)) {
    throw new Error(`Missing ${name} in ${cwd}. Run npm install in that directory before building.`);
  }
  return commandPath;
}

function copyFolderRecursiveSync(source, target) {
  if (!fs.existsSync(target)) {
    fs.mkdirSync(target, { recursive: true });
  }

  const files = fs.readdirSync(source);
  for (const file of files) {
    const curSource = path.join(source, file);
    const curTarget = path.join(target, file);

    if (fs.lstatSync(curSource).isDirectory()) {
      copyFolderRecursiveSync(curSource, curTarget);
    } else {
      fs.copyFileSync(curSource, curTarget);
    }
  }
}

try {
  console.log('--- Building main application ---');
  run(`"${assertLocalCommand(__dirname, 'vite')}" build`, { cwd: __dirname });

  console.log('--- Building logistics panel ---');
  const logisticsDir = path.join(__dirname, 'components', 'painel-logistica');

  console.log('Compiling painel-logistica...');
  run(`"${assertLocalCommand(logisticsDir, 'vite')}" build`, { cwd: logisticsDir });

  console.log('--- Copying logistics build to dist/logistica ---');
  const srcDist = path.join(logisticsDir, 'dist');
  const destDist = path.join(__dirname, 'dist', 'logistica');

  copyFolderRecursiveSync(srcDist, destDist);
  console.log('Logistics panel successfully integrated into dist/logistica.');
} catch (error) {
  console.error('Build failed:', error);
  process.exit(1);
}
