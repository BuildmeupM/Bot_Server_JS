const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.JWT_SECRET || 'fallback_secret_key_123456789012';

function decrypt(text) {
    if (!text) return text;
    try {
        const key = crypto
            .createHash('sha256')
            .update(String(ENCRYPTION_KEY))
            .digest('base64')
            .substring(0, 32);
        const textParts = text.split(':');
        const iv = Buffer.from(textParts.shift(), 'hex');
        const encryptedText = Buffer.from(textParts.join(':'), 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(key), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) {
        console.error('Decryption failed', e);
        return text;
    }
}

module.exports = { decrypt };
