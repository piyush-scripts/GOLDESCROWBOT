const bitcoin = require('bitcoinjs-lib');
const axios = require('axios');
const ecc = require('tiny-secp256k1');

bitcoin.initEccLib(ecc);

// 0.00001 something
const buyer_wallet = {
    addr: "tb1qzkrprzjxrl8weylt7hy7dx5qcgj3q0v33plwrj",
    privateKey: "KzwpftN8nedURJjiS2foSLXz7tbcvTLourkJvkttraAUQLs2iGwU"
}

// 0.00000011 something
const seller_wallet = {
    addr: "tb1qkpwnfsnp30gv9cz0y8z2zsc74mal0y53fp4zwf",
    privateKey: "L4nkq6TkvqDKNuN1WooAfUMzqy4mGurQfawJDcJX7QKpLPrctG6m"
}
const escrow_wallet = {
    addr: "tb1qux5265kpeyys5n6pp8x254g5syg45h0yqmhdh3",
    privateKey: "L54pB36434Zegb4PMCXsCgN1SwyXsJnntPfTkMtCAZqkNZF74xgp"
}

const fromAddress = buyer_wallet.addr;
const toAddress = seller_wallet.addr;
const privateKey = buyer_wallet.privateKey;
const amount = 0.00001; // 1000 satoshis

async function transferBitcoin(fromAddress, toAddress, amount, privateKey, network = bitcoin.networks.testnet) {
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
        const feeRate = 10; // satoshis per byte (this can be adjusted)
        const estimatedTxSize = 180; // estimated size of the transaction in bytes
        const fee = BigInt(feeRate * estimatedTxSize); // total fee in satoshis

        // Add inputs
        let totalInput = BigInt(0);
        for (const utxo of utxos) {
            psbt.addInput({
                hash: utxo.txid,
                index: utxo.vout,
                witnessUtxo: {
                    script: Buffer.from(utxo.scriptPubKey, 'hex'),
                    value: BigInt(utxo.value)
                },
            });
            totalInput += BigInt(utxo.value);
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
            value: Number(satoshis) // Convert back to number for addOutput
        });

        // Calculate and add change output if necessary
        const change = totalInput - satoshis - fee;
        if (change > dustThreshold) { // Avoid dust change
            psbt.addOutput({
                address: fromAddress,
                value: Number(change) // Convert change to number for addOutput
            });
        }

        // Log debugging info
        console.log(`Total input: ${totalInput}`);
        console.log(`Amount to send: ${satoshis}`);
        console.log(`Fee: ${fee}`);
        console.log(`Change: ${change}`);

        // Sign inputs
        const keyPair = bitcoin.ECPair.fromWIF(privateKey, network);
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


async function fetchUTXOs(address, network) {
    try {
        const apiUrl = `https://blockstream.info/testnet/api/address/${address}/utxo`
        console.log({
            apiUrl
        })
        const response = await axios.get(apiUrl);
        console.log(response.data)
        const utxos = await Promise.all(response.data.map(async utxo => {
            console.log(utxo.txid)
            const txResponse = await axios.get(`https://blockstream.info/testnet/api/tx/${utxo.txid}`);
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

async function broadcastTransaction(txHex, network) {
    const apiUrl = `https://blockstream.info/testnet/api/tx`;
    const response = await axios.post(apiUrl, txHex);
    return response.data; // Transaction ID
}

// Usage example:
transferBitcoin(fromAddress, toAddress, amount, privateKey)
    .then(txid => console.log('Transaction ID:', { txid }))
    .catch(err => console.error('Error:', { err }));
// check karo tum apna address daal ke