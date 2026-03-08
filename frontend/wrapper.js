const { execSync } = require('child_process');
try {
  const out = execSync('node C:\\Users\\USER\\genBase64.js', { encoding: 'utf8' });
  console.log('OUT:', out);
} catch (e) {
  console.error('STDOUT:', e.stdout);
  console.error('STDERR:', e.stderr);
}
