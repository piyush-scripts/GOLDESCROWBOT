const bitcoin = require('bitcoinjs-lib');
const axios = require('axios');
const ecc = require('tiny-secp256k1');
const dotenv = require('dotenv');
const BitcoinConfig = require('./config/btc');
const { ECPairFactory } = require('ecpair');
const ECPair = ECPairFactory(ecc)
dotenv.config();

bitcoin.initEccLib(ecc);

const config = process.env.NODE_ENV === "development"
    ? BitcoinConfig.getNetworkConfig('testnet')
    : BitcoinConfig.getNetworkConfig('mainnet');

const network = process.env.NODE_ENV === "development"
    ? bitcoin.networks.testnet
    : bitcoin.networks.bitcoin; // Correctly set network


/**
 * @async
 * @param {string} address address for checking the balance
 * @returns {Promise<{balance: number, fees: number} | null>} balance in BTC and estimated fees, null if API request fails
 */
async function getBTCBalance(address) {
    try {
        const { data: utxos } = await axios.get(`${config.explorer.apiUrl}/address/${address}/utxo`);

        if (!utxos || !Array.isArray(utxos)) {
            throw new Error("Failed to get Balance of Address");
        }

        let balance = 0;
        for (const utxo of utxos) {
            balance += utxo.value;
        }

        const ret_balance = BitcoinConfig.satoshisToBTC(balance);

        // Get current fee rate
        const feeRate = await getFeeRate();
        const estimatedTxSize = 180; // Estimated transaction size in vBytes
        const estimatedFees = BitcoinConfig.satoshisToBTC(feeRate * estimatedTxSize);

        return {
            balance: ret_balance,
            fees: estimatedFees
        };
    } catch (error) {
        console.error('Error in getBTCBalance:', error);
        return null;
    }
}

/**
 * @async
 * @returns {Promise<number>} Fee rate in satoshis/vByte
 */
async function getFeeRate() {
    try {
        const response = await axios.get('https://mempool.space/api/v1/fees/recommended');
        // Using 'fastestFee' for quicker confirmation. You can also use 'halfHourFee' or 'hourFee'
        return response.data.fastestFee;
    } catch (error) {
        console.error('Error fetching fee rate:', error);
        // Return a default fee rate if API call fails
        return 10; // 10 sat/vByte as a fallback
    }
}

async function transferBitcoin(fromAddress, toAddress, amount, privateKey) {
    try {
        // Convert amount to satoshis
        const satoshis = BigInt(Math.floor(amount * 100000000));

        // Minimum output threshold to avoid dust outputs
        const dustThreshold = BigInt(546);

        if (satoshis < dustThreshold) {
            throw new Error(`The amount to send(${satoshis} satoshis) is below the dust threshold.`);
        }

        // Create a new PSBT
        const psbt = new bitcoin.Psbt({ network });

        // Fetch UTXOs for the from address
        const utxos = await fetchUTXOs(fromAddress, network);
        console.log({ utxos });

        // Estimate fee rate and transaction size
        const feeRate = await getFeeRate(); // satoshis per byte (this can be adjusted)
        const estimatedTxSize = 180; // estimated size of the transaction in bytes
        const fee = BigInt(feeRate * estimatedTxSize); // total fee in satoshis

        // Add inputs
        let totalInput = BigInt(0);
        for (const utxo of utxos) {
            let idx = 0;
            console.log({
                hash: utxo.txid,
                index: utxo.vout,
                witnessUtxo: {
                    script: Buffer.from(utxo.scriptPubKey, 'hex'),
                    value: BigInt(utxo.value)
                },
            })
            psbt.addInput({
                hash: utxo.txid,
                index: utxo.vout,
                witnessUtxo: {
                    script: Buffer.from(utxo.scriptPubKey, 'hex'),
                    value: BigInt(utxo.value)
                },
            });
            totalInput += BigInt(utxo.value);
            console.log(`${idx++}: ${totalInput}`)
            if (totalInput >= satoshis + fee) {
                break; // Stop adding inputs if we have enough
            }
        }

        // Ensure totalInput covers the amount + fee
        if (totalInput < satoshis + fee) {
            throw new Error('Insufficient funds to cover the transaction and fee.');
        }

        // Add recipient output
        psbt.addOutput({
            address: toAddress,
            value: satoshis // Convert back to number for addOutput
        });

        // Calculate and add change output if necessary
        const change = totalInput - satoshis - fee;
        if (change > dustThreshold) { // Avoid dust change
            psbt.addOutput({
                address: fromAddress,
                value: change // Convert change to number for addOutput
            });
        }

        // Log debugging info
        console.log(`Total input: ${totalInput}`);
        console.log(`Amount to send: ${satoshis}`);
        console.log(`Fee: ${fee}`);
        console.log(`Change: ${change}`);

        // Sign inputs
        const keyPair = ECPair.fromWIF(privateKey, network);
        for (let i = 0; i < psbt.inputCount; i++) {
            psbt.signInput(i, keyPair);
        }

        // Finalize and build transaction
        psbt.finalizeAllInputs();
        const tx = psbt.extractTransaction();
        const serializedTx = tx.toHex();

        // Broadcast the transaction
        const txid = await broadcastTransaction(serializedTx, network);
        console.log({ txid })
        return txid;

    } catch (error) {
        console.error('Error transferring Bitcoin:', error);
        throw error;
    }
}


async function fetchUTXOs(address) {
    try {
        const apiUrl = `${config.explorer.apiUrl}/address/${address}/utxo`
        const response = await axios.get(apiUrl);
        const utxos = await Promise.all(response.data.map(async utxo => {
            console.log(utxo.txid)
            const txResponse = await axios.get(`${config.explorer.apiUrl}/tx/${utxo.txid}`);
            return {
                txid: utxo.txid,
                vout: utxo.vout,
                value: utxo.value,
                scriptPubKey: txResponse.data.vout[utxo.vout].scriptpubkey
            };
        }));
        return utxos;
    } catch (error) {
        console.error({ error })
    }
}

async function broadcastTransaction(txHex) {
    const apiUrl = `${config.explorer.apiUrl}/tx`;
    const response = await axios.post(apiUrl, txHex);
    return response.data; // Transaction ID
}

module.exports = { transferBitcoin, getBTCBalance };
