// @ts-check

const bitcoin = require('bitcoinjs-lib');

/**
 * @typedef {Object} NetworkConfig
 * @property {string} name - The name of the network (e.g., "mainnet" or "testnet")
 * @property {string} bech32 - The Bech32 address prefix
 * @property {number} pubKeyHash - The public key hash prefix
 * @property {number} scriptHash - The script hash prefix
 * @property {number} wif - The WIF (Wallet Import Format) prefix
 * @property {{public: number, private: number}} bip32 - The BIP32 prefix for public and private keys
 */

/**
 * @typedef {Object} RPCConfig
 * @property {string} url - The default RPC URL for the network
 * @property {number} port - The default RPC port for the network
 */

/**
 * @typedef {Object} ExplorerConfig
 * @property {string} url - The block explorer URL for the network
 * @property {string} apiUrl - The API URL for the block explorer
 */

/**
 * @typedef {Object} NetworkObjects
 * @property {NetworkConfig} network - Network configuration
 * @property {RPCConfig} rpc - RPC configuration
 * @property {ExplorerConfig} explorer - Explorer configuration
 */

/**
 * @typedef {Object} BitcoinConfigType
 * @property {number} SATOSHIS_PER_BTC - Satoshi to BTC conversion rate
 * @property {NetworkObjects} mainnet - Mainnet configuration
 * @property {NetworkObjects} testnet - Testnet configuration
 * @property {(networkType: 'mainnet' | 'testnet') => NetworkObjects} getNetworkConfig - Get the configuration for a specific network
 * @property {(satoshis: number) => number} satoshisToBTC - Convert satoshis to BTC
 * @property {(address: string) => boolean} isValidBTCAddress - Function to validate a BTC address
 * @property {(btc: number) => number} BTCToSatoshis - Convert BTC to satoshis
 */

/** @type {BitcoinConfigType} */
const BitcoinConfig = {
    SATOSHIS_PER_BTC: 100_000_000,

    mainnet: {
        network: {
            name: 'mainnet',
            bech32: 'bc',
            pubKeyHash: 0x00,
            scriptHash: 0x05,
            wif: 0x80,
            bip32: {
                public: 0x0488b21e,
                private: 0x0488ade4,
            },
        },
        rpc: {
            url: 'https://btc-mainnet.example.com',
            port: 8332,
        },
        explorer: {
            url: 'https://blockstream.info',
            apiUrl: 'https://blockstream.info/api',
        },
    },

    testnet: {
        network: {
            name: 'testnet',
            bech32: 'tb',
            pubKeyHash: 0x6f,
            scriptHash: 0xc4,
            wif: 0xef,
            bip32: {
                public: 0x043587cf,
                private: 0x04358394,
            },
        },
        rpc: {
            url: 'https://btc-testnet.example.com',
            port: 18332,
        },
        explorer: {
            url: 'https://blockstream.info/testnet',
            apiUrl: 'https://blockstream.info/testnet/api',
        },
    },

    getNetworkConfig(networkType) {
        return this[networkType];
    },

    satoshisToBTC(satoshis) {
        return satoshis / this.SATOSHIS_PER_BTC;
    },

    isValidBTCAddress(address) {
        try {
            bitcoin.address.toOutputScript(address);
            return true;
        } catch (err) {
            return false;
        }
    },

    BTCToSatoshis(btc) {
        return btc * this.SATOSHIS_PER_BTC;
    },
};

module.exports = BitcoinConfig;