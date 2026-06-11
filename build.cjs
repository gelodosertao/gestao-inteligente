const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

try {
  // 1. Build main application
  console.log('--- Building main application ---');
  execSync('vite build', { stdio: 'inherit' });

  // 2. Build logistics panel
  console.log('--- Building logistics panel ---');
  const logisticsDir = path.join(__dirname, 'components', 'painel-logistica');
  
  // Ensure dependencies are installed in painel-logistica
  console.log('Installing dependencies for painel-logistica...');
  execSync('npm install', { cwd: logisticsDir, stdio: 'inherit' });
  
  console.log('Compiling painel-logistica...');
  execSync('vite build', { cwd: logisticsDir, stdio: 'inherit' });

  // 3. Copy logistics dist to main dist/logistica
  console.log('--- Copying logistics build to dist/logistica ---');
  const srcDist = path.join(logisticsDir, 'dist');
  const destDist = path.join(__dirname, 'dist', 'logistica');

  function copyFolderRecursiveSync(sources, target) {
    if (!fs.existsSync(target)) {
      fs.mkdirSync(target, { recursive: true });
    }
    const files = fs.readdirSync(sources);
    for (const file of files) {
      const curSource = path.join(sources, file);
      const curTarget = path.join(target, file);
      if (fs.lstatSync(curSource).isDirectory()) {
        copyFolderRecursiveSync(curSource, curTarget);
      } else {
        fs.copyFileSync(curSource, curTarget);
      }
    }
  }

  copyFolderRecursiveSync(srcDist, destDist);
  console.log('🎉 Logistics panel successfully integrated into dist/logistica!');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
