const { execSync } = require('child_process');

try {
  console.log('--- Building main application ---');
  execSync('vite build', { stdio: 'inherit' });
  console.log('Main application built successfully. Inactive modules were not bundled.');
} catch (error) {
  console.error('❌ Build failed:', error);
  process.exit(1);
}
