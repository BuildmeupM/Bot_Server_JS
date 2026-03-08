const fs = require('fs');
const babel = require('@babel/core');
try {
  babel.parseSync(fs.readFileSync('src/pages/docsort/OcrBatchPage.jsx', 'utf-8'), {
    filename: 'OcrBatchPage.jsx',
    presets: ['@babel/preset-react']
  });
  console.log('JSX Valid!');
} catch (e) {
  console.log('Error:', e.message);
}
