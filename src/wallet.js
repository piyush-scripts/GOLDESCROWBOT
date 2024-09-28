const bip39 = require('bip39');
const bitcoin = require('bitcoinjs-lib');
const ecc = require('tiny-secp256k1');
const { BIP32Factory } = require('bip32');
const dotenv = require("dotenv");

dotenv.config();

const bip32 = BIP32Factory(ecc);
const network = process.env.NODE_ENV === "development" ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

// Define a specific derivation path
const derivationPath = "m/44'/0'/0'/0/";

/**
 * Generate a wallet for a user (buyer, seller, or escrow)
 * @param {string} mnemonic 
 * @param {number} idx 
 */
async function generateEscrowWallet(mnemonic, idx) {
    const seed = await bip39.mnemonicToSeed(mnemonic);
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

module.exports = { generateEscrowWallet };