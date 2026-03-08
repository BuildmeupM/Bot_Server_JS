import fs from 'fs';
import https from 'https';

const download = (url, dest) => {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest);
      reject(err.message);
    });
  });
};

(async () => {
  try {
    if (!fs.existsSync('./public/fonts')) {
      fs.mkdirSync('./public/fonts', { recursive: true });
    }
    await download('https://raw.githubusercontent.com/lazywasabi/thai-web-fonts/master/fonts/Sarabun/Sarabun-Regular.ttf', './public/fonts/Sarabun-Regular.ttf');
    await download('https://raw.githubusercontent.com/lazywasabi/thai-web-fonts/master/fonts/Sarabun/Sarabun-Bold.ttf', './public/fonts/Sarabun-Bold.ttf');
    console.log('Fonts downloaded successfully.');
  } catch(e) {
    console.error('Error downloading fonts', e);
  }
})();
