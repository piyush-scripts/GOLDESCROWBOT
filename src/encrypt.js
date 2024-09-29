const crypto = require('crypto')
const dotenv = require('dotenv');
dotenv.config();

function encryptPrivateKey(privateKey) {
    const iv = crypto.randomBytes(16);
    const salt = crypto.randomBytes(64);
    const key = crypto.pbkdf2Sync(process.env.MASTER_KEY, salt, 100000, 32, 'sha512');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const encrypted = Buffer.concat([cipher.update(privateKey, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();

    return {
        iv: iv.toString('hex'),
        salt: salt.toString('hex'),
        encrypted: encrypted.toString('hex'),
        tag: tag.toString('hex')
    };
}

function decryptPrivateKey(encryptedData) {
    const iv = Buffer.from(encryptedData.iv, 'hex');
    const salt = Buffer.from(encryptedData.salt, 'hex');
    const encrypted = Buffer.from(encryptedData.encrypted, 'hex');
    const tag = Buffer.from(encryptedData.tag, 'hex');

    const key = crypto.pbkdf2Sync(process.env.MASTER_KEY, salt, 100000, 32, 'sha512');
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
}

module.exports = { encryptPrivateKey, decryptPrivateKey };