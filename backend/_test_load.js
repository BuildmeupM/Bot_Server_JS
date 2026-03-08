require('dotenv').config();
try {
    const bot = require('./routes/bot-database');
    console.log('bot-database module loaded OK');
} catch(e) {
    console.error('LOAD ERROR:', e.message);
    console.error(e.stack);
}
process.exit(0);
