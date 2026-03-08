const fs = require('fs');
const path = require('path');

const srcDir = 'C:\\Users\\USER\\.gemini\\antigravity\\brain\\b12a1933-a8f2-41d1-8146-0c7b64ad8f9a';
const destFile = 'v:\\A.โฟร์เดอร์หลัก\\Build000 ทดสอบระบบ\\ส่วนตัวเอ็ม\\Bot_server_nodeJS\\frontend\\src\\pages\\docsort\\manualImages.js';

try {
  const managePage = fs.readFileSync(path.join(srcDir, 'manage_page_1772206230220.png')).toString('base64');
  const toolsPage = fs.readFileSync(path.join(srcDir, 'tools_page_1772206212152.png')).toString('base64');
  const mergePdf = fs.readFileSync(path.join(srcDir, 'merge_pdf_tab_1772206470061.png')).toString('base64');
  const imagePdf = fs.readFileSync(path.join(srcDir, 'image_to_pdf_tab_1772206476258.png')).toString('base64');

  const content = `
export const managePageImg = "data:image/png;base64,${managePage}";
export const toolsPageImg = "data:image/png;base64,${toolsPage}";
export const mergePdfImg = "data:image/png;base64,${mergePdf}";
export const imagePdfImg = "data:image/png;base64,${imagePdf}";
`;

  fs.writeFileSync(destFile, content, 'utf8');
  console.log('✅ Base64 images successfully generated!');
} catch (e) {
  console.error('❌ Failed to generate base64:', e.message);
}
