const fs = require('fs');
const filepath = 'backend/routes/bot-automation.js';
let code = fs.readFileSync(filepath, 'utf8');

const target = `                                         addLog(job.id, 'info', \`✅ ข้อมูลที่อยู่รวมบนเว็บครบถ้วนตรงกับ Excel แล้ว (ไม่ต้องทับซ้ำ)\`);
                                     }
                                 } else {
                                         addLog(job.id, 'info', \`✅ ข้อมูลที่อยู่บนเว็บตรงกับ Excel แล้ว (ไม่ต้องทับซ้ำ)\`);
                                     }
                                 } else {`;

const replacement = `                                         addLog(job.id, 'info', \`✅ ข้อมูลที่อยู่รวมบนเว็บครบถ้วนตรงกับ Excel แล้ว (ไม่ต้องทับซ้ำ)\`);
                                     }
                                 } else {`;

code = code.replace(target, replacement);
fs.writeFileSync(filepath, code, 'utf8');
console.log('Fixed syntax error.');
