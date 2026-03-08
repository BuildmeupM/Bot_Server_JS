const fs = require('fs');
const path = require('path');

const srcDir = 'C:\\Users\\USER\\.gemini\\antigravity\\brain\\b12a1933-a8f2-41d1-8146-0c7b64ad8f9a';
const destDir = 'v:\\A.โฟร์เดอร์หลัก\\Build000 ทดสอบระบบ\\ส่วนตัวเอ็ม\\Bot_server_nodeJS\\frontend\\public\\manual_assets';

try {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
    console.log('Created destDir');
  }

  const files = [
    { src: 'manage_page_1772206230220.png', dest: 'manage_page.png' },
    { src: 'tools_page_1772206212152.png', dest: 'tools_page.png' },
    { src: 'merge_pdf_tab_1772206470061.png', dest: 'merge_pdf_tab.png' },
    { src: 'image_to_pdf_tab_1772206476258.png', dest: 'image_to_pdf_tab.png' }
  ];

  files.forEach(file => {
    fs.copyFileSync(path.join(srcDir, file.src), path.join(destDir, file.dest));
    console.log('Copied ' + file.src);
  });
  console.log('Copy absolute complete');
} catch (e) {
  fs.writeFileSync('v:\\A.โฟร์เดอร์หลัก\\Build000 ทดสอบระบบ\\ส่วนตัวเอ็ม\\Bot_server_nodeJS\\frontend\\err.log', e.toString());
}
