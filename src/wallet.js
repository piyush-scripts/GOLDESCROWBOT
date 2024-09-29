const bip39 = require('bip39');
const bitcoin = require('bitcoinjs-lib');
const ecc = require('tiny-secp256k1');
const { BIP32Factory } = require('bip32');
const dotenv = require("dotenv");
const { encryptPrivateKey } = require('./encrypt');
const db = require('./db');

dotenv.config();

const bip32 = BIP32Factory(ecc);
const network = process.env.NODE_ENV === "development" ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

// Define a specific derivation path
const derivationPath = "m/44'/0'/0'/0/";

/**
 * Generate a wallet for a user (buyer, seller, or escrow)
 * @param {string} mnemonic 
 * @param {number} idx 
 * @returns {{ address: string, publicKey: string, privateKey: string }} The generated wallet details.
 */
function generateEscrowWallet(mnemonic, idx) {
    const seed = bip39.mnemonicToSeedSync(mnemonic);
    const root = bip32.fromSeed(seed, network);
    const child = root.derivePath(derivationPath + idx);

    const { address } = bitcoin.payments.p2wpkh({
        pubkey: child.publicKey,
        network
    });

    return {
        address,
        publicKey: child.publicKey.toString('hex'),
        privateKey: child.toWIF()
    };
}

/**
 * @param {number} groupId
 * @returns {{message: string} | null>}
 */
async function createEscrowWallet(groupId) {
    const mnemonic = process.env.MNEMONIC
    try {
        const db_len = await db.user.count();
        const { address, privateKey } = generateEscrowWallet(mnemonic, db_len);

        const encryptedKey = encryptPrivateKey(privateKey);

        await db.user.update({
            where: {
                group_id: groupId
            },
            data: {
                escrow_btc_address: address,
                escrow_private_key: JSON.stringify(encryptedKey),
            }
        });

        return { message: "success" }
    } catch (err) {
        console.error(err);
        return null;
    }
}

module.exports = { createEscrowWallet };