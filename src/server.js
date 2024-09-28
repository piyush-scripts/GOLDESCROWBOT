const { Telegraf } = require("telegraf");
const pg = require("pg");
const bitcoin = require("bitcoinjs-lib");
const { setDefaultResultOrder } = require("node:dns");
const dotenv = require("dotenv");
const tinysecp = require("tiny-secp256k1");
const { ECPairFactory } = require("ecpair");
const db = require("./db");
const { createEscrowWallet } = require("./wallet");
const { transferBitcoin, getUTXOS } = require("./txn");

dotenv.config();
const network = process.env.NODE_ENV === "development" ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

const bot = new Telegraf(process.env.GOLD_ESCROW_BOT_TOKEN);

bot.command("seller", async (ctx) => {
  try {
    const message = ctx.message.text;
    const userId = ctx.from.id;
    const groupId = ctx.chat.id;
    const btcAddress = message.split(" ")[1];

    if (btcAddress && isValidBTCAddress(btcAddress)) {
      // const groupMetadata = await pool.query(
      //   "SELECT seller_user_id, buyer_user_id FROM users WHERE group_id = $1",
      //   [groupId]
      // );

      const groupMetadata = await db.user.findFirst(parseInt(groupId))

      if (groupMetadata !== null) {
        if (
          groupMetadata.buyer_user_id !== null &&
          parseInt(groupMetadata.buyer_user_id) === userId
        ) {
          ctx.reply("Buyer can't run /seller command");
          return;
        }

        if (groupMetadata.seller_user_id !== null) {
          ctx.reply("There already exists a seller in this group");
          return;
        }

        // pool.query(
        // "UPDATE users SET seller_user_id = $1, seller_btc_address = $2 WHERE group_id = $3",
        // [userId, btcAddress, groupId]
        // );

        await db.user.upsert({
          where: {
            group_id: groupId,
          },
          create: {
            seller_user_id: userId,
            seller_btc_address: btcAddress,
          }
        })

      } else {
        // pool.query(
        // "INSERT INTO users (group_id, seller_user_id, seller_btc_address) VALUES ($1, $2, $3)",
        // [groupId, userId, btcAddress]
        // );
        await db.user.create({
          data: {
            group_id: groupId,
            seller_user_id: userId,
            seller_btc_address: btcAddress
          }
        })
      }

      const res = createEscrowWallet(groupId);

      if (res === null) {
        ctx.reply("Please try again, failed to initialise Escrow Wallet.");
      } else {
        ctx.reply("You are now a seller! Your role has been updated.");
      }
    } else {
      ctx.reply(
        "Please provide a valid BTC address. Example: /seller <btc_address>"
      );
    }
  } catch (err) {
    console.log(err);

  }
});

bot.command("buyer", async (ctx) => {
  try {
    const message = ctx.message.text;
    const userId = ctx.from.id;
    const groupId = ctx.chat.id;
    const btcAddress = message.split(" ")[1];

    if (btcAddress && isValidBTCAddress(btcAddress)) {
      // const groupMetadata = await pool.query(
      //   "SELECT buyer_user_id, seller_user_id FROM users WHERE group_id = $1",
      //   [groupId]
      // );
      const groupMetadata = await db.user.findFirst(groupId);

      if (groupMetadata !== null) {
        if (
          groupMetadata.seller_user_id !== null &&
          parseInt(groupMetadata.seller_user_id) === userId
        ) {
          ctx.reply("Seller can't run /buyer command");
          return;
        }

        if (groupMetadata.buyer_user_id !== null) {
          ctx.reply("There already exists a buyer in this group");
          return;
        }

        // pool.query(
        //   "UPDATE users SET buyer_user_id = $1, buyer_btc_address = $2 WHERE group_id = $3",
        //   [userId, btcAddress, groupId]
        // );

        await db.user.update({
          where: {
            group_id: groupId
          },
          data: {
            buyer_user_id: userId,
            buyer_btc_address: btcAddress
          }
        })
      } else {
        // pool.query(
        //   "INSERT INTO users (group_id, buyer_user_id, buyer_btc_address) VALUES ($1, $2, $3)",
        //   [groupId, userId, btcAddress]
        // );
        await db.user.create({
          data: {
            group_id: groupId,
            buyer_user_id: userId,
            buyer_btc_address: btcAddress
          }
        })
      }

      ctx.reply("You are now a buyer! Your role has been updated.");
    } else {
      ctx.reply(
        "Please provide a valid BTC address. Example: /buyer <btc_address>"
      );
    }
  } catch (err) {
    console.log(err);
  }
});

// Function to validate a BTC address
function isValidBTCAddress(address) {
  try {
    bitcoin.address.toOutputScript(address);
    return true;
  } catch (err) {
    return false;
  }
}

// Seller-only command
bot.command("refund", async (ctx) => {
  const userId = ctx.from.id;
  const groupId = ctx.message.from.id;
  // const sellerBtcAddress = await pool.query(
  //   "SELECT seller_btc_address FROM users WHERE group_id=$1 AND seller_user_id=$2",
  //   [groupId, userId]
  // );
  const group = await db.user.findFirst({
    where: {
      group_id: groupId,
      seller_user_id: userId,
    }
  })

  if (userId === group.seller_user_id) {
    const fromAddress = group.escrow_btc_address;
    const privateKey = group.escrow_private_key;
    const toAddress = group.buyer_btc_address;
    const amount = await getUTXOS(fromAddress);

    const transfer = await transferBitcoin(fromAddress, toAddress, amount, privateKey, network);

    ctx.reply(`Refunded ${amount} to ${toAddress}\n txid: ${transfer}`)
  } else {
    ctx.reply("You need to be a seller to access this command.");
  }

  // if (users[userId] && users[userId].role === "seller") {
  //   const groupId = users[userId].groupId;
  //   ctx.reply(
  //     `This is a special command only for sellers in group ${groupId}!`
  //   );
  // } else {
  //   ctx.reply("You need to be a seller to access this command.");
  // }

});
// Buyer-only command
bot.command("release", async (ctx) => {
  const userId = ctx.from.id;
  const groupId = ctx.message.from.id;
  // const sellerBtcAddress = await pool.query(
  //   "SELECT seller_btc_address FROM users WHERE group_id=$1 AND seller_user_id=$2",
  //   [groupId, userId]
  // );
  const group = await db.user.findFirst({
    where: {
      group_id: groupId,
      buyer_user_id: userId,
    }
  })

  if (userId === group.seller_user_id) {
    const fromAddress = group.escrow_btc_address;
    const privateKey = group.escrow_private_key;
    const toAddress = group.seller_btc_address;
    const amount = await getUTXOS(fromAddress);

    const transfer = await transferBitcoin(fromAddress, toAddress, amount, privateKey, network);

    ctx.reply(`Release ${amount} to ${toAddress}\n txid: ${transfer}`)
  } else {
    ctx.reply("You need to be a buyer to access this command.");
  }

  // if (users[userId] && users[userId].role === "seller") {
  //   const groupId = users[userId].groupId;
  //   ctx.reply(
  //     `This is a special command only for sellers in group ${groupId}!`
  //   );
  // } else {
  //   ctx.reply("You need to be a seller to access this command.");
  // }

});

bot.command("start", (ctx) => {
  console.log("check telegram now");

  const intromessage = `<b>🌟 GOLDESCROWBOT™ v.1</b>
   An Automated Telegram Escrow Service
   
   Welcome to <b>GOLDESCROWBOT™</b>. This bot provides a safe escrow service for your business on Telegram. Never get ripped off again; your funds are safe throughout your deals. If you have any issues, kindly type /contact, and an arbitrator will join the group chat within 24 hours.
   
   <b>💰 ESCROW FEE:</b>
   5% if over $100
   5$ if under $100
   
   <b>🔄 UPDATES - VOUCHES</b>
   <b>✔️ DEALS DONE:</b> 1000+
   <b>⚖️ DISPUTES HANDLED:</b> 150+
   
   💬 Declare the seller or buyer with /seller or /buyer [BTC/LTC ADDRESS] (Your BTC/LTC address = [BTC/LTC ADDRESS])
  
   💡 Type /menu to summon a menu with all bot features`;
  ctx.reply(intromessage, { parse_mode: "HTML" });
});

try {
  setDefaultResultOrder("ipv4first");
  bot.launch();
} catch (err) {
  console.log(err);
}

process.once("SIGNIT", () => bot.stop("SIGNIT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));