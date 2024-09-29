const { Telegraf } = require("telegraf");
const bitcoin = require("bitcoinjs-lib");
const { setDefaultResultOrder } = require("node:dns");
const dotenv = require("dotenv");
const db = require("./db");
const { createEscrowWallet } = require("./wallet");
const { transferBitcoin, getUTXOS, getBTCBalance } = require("./txn");
const { isValidBTCAddress } = require('./config/btc');
const { decryptPrivateKey } = require('./encrypt')

dotenv.config();
const network = process.env.NODE_ENV === "development" ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

const bot = new Telegraf(process.env.GOLD_ESCROW_BOT_TOKEN);

bot.command("seller", async (ctx) => {
  try {
    const message = ctx.message.text;
    const userId = ctx.from.id;
    const groupId = ctx.chat.id;
    const btcAddress = message.split(" ")[1]?.trim();

    if (btcAddress && isValidBTCAddress(btcAddress, network)) {
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
          await ctx.reply("Buyer can't run /seller command");
          return
        }

        if (groupMetadata.seller_user_id !== null) {
          await ctx.reply("There already exists a seller in this group");
          return
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
        console.error(`Failed to create escrow wallet for group ${groupId}`);
        await ctx.reply("Please try again, failed to initialise Escrow Wallet.");
        return
      } else {
        await ctx.reply("You are now a seller! Your role has been updated.");

      }
    } else {
      await ctx.reply(

        "Please provide a valid BTC address. Example: /seller <btc_address>"
      );
    }
  } catch (err) {
    console.error(err);

  }
});

bot.command("balance", async (ctx) => {
  try {
    const groupId = ctx.chat.id;
    const userId = ctx.from.id;

    const group = await db.user.findFirst({
      where: {
        group_id: groupId,
        OR: [{ buyer_user_id: userId }, { seller_user_id: userId }]
      }
    });

    if (!group || !group.escrow_btc_address) {
      await ctx.reply("No seller exists, escrow not initialised");
      return;
    }

    const balance = await getBTCBalance(group.escrow_btc_address);
    if (balance === null) {
      throw new Error("Error fetching balance");
    }

    await ctx.reply(`Balance of current escrow (${group.escrow_btc_address}): ${balance} BTC`);
  } catch (error) {
    console.error("Error in balance command:", error);
    await ctx.reply("An error occurred while fetching balance of escrow");
  }
});

bot.command("buyer", async (ctx) => {
  try {
    const message = ctx.message.text;
    const userId = ctx.from.id;
    const groupId = ctx.chat.id;
    const btcAddress = message.split(" ")[1];

    if (btcAddress && isValidBTCAddress(btcAddress, network)) {
      const groupMetadata = await db.user.findFirst(groupId);

      if (groupMetadata !== null) {
        if (
          groupMetadata.seller_user_id !== null &&
          parseInt(groupMetadata.seller_user_id) === userId
        ) {
          await ctx.reply("Seller can't run /buyer command");

          return;
        }

        if (groupMetadata.buyer_user_id !== null) {
          await ctx.reply("There already exists a buyer in this group");

          return;
        }

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
        await db.user.create({
          data: {
            group_id: groupId,
            buyer_user_id: userId,
            buyer_btc_address: btcAddress
          }
        })
      }

      await ctx.reply("You are now a buyer! Your role has been updated.");

    } else {
      await ctx.reply(

        "Please provide a valid BTC address. Example: /buyer <btc_address>"
      );
    }
  } catch (err) {
    console.error(err);
  }
});

// Seller-only command
bot.command("refund", async (ctx) => {
  try {
    const userId = ctx.from.id;
    const groupId = ctx.chat.id;

    const group = await db.user.findFirst({
      where: {
        group_id: groupId,
        seller_user_id: userId,
      }
    });

    if (!group || userId !== group.seller_user_id) {
      await ctx.reply("You need to be a seller to access this command.");
      return
    }

    const fromAddress = group.escrow_btc_address;
    const privateKey = decryptPrivateKey(JSON.parse(group.escrow_private_key));
    const toAddress = group.buyer_btc_address;
    const amount = await getBTCBalance(fromAddress);

    if (amount <= 0) {
      await ctx.reply("Insufficient balance to proceed.");
      return
    }

    const transfer = await transferBitcoin(fromAddress, toAddress, amount, privateKey, network);

    await ctx.reply(`Refunded ${amount} BTC to ${toAddress}\nTransaction ID: ${transfer}`);

  } catch (error) {
    console.error("Error in refund command:", error);
    await ctx.reply("An error occurred while processing the refund. Please try again later.");

  }
});

bot.command("release", async (ctx) => {
  try {
    const userId = ctx.from.id;
    const groupId = ctx.chat.id;

    const group = await db.user.findFirst({
      where: {
        group_id: groupId,
        buyer_user_id: userId,
      }
    });

    if (!group || userId !== group.buyer_user_id) {
      await ctx.reply("You need to be a buyer to access this command.");
      return
    }

    const fromAddress = group.escrow_btc_address;
    const privateKey = decryptPrivateKey(JSON.parse(group.escrow_private_key));
    const toAddress = group.seller_btc_address;
    const amount = await getBTCBalance(fromAddress);

    if (amount <= 0) {
      await ctx.reply("Insufficient balance to proceed.");
      return
    }

    const transfer = await transferBitcoin(fromAddress, toAddress, amount, privateKey, network);

    await ctx.reply(`Released ${amount} BTC to ${toAddress}\nTransaction ID: ${transfer}`);

  } catch (error) {
    console.error("Error in release command:", error);
    await ctx.reply("An error occurred while processing the release. Please try again later.");

  }
});

bot.command("start", async (ctx) => {
  try {
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

    await ctx.reply(intromessage, { parse_mode: "HTML" });
  } catch (error) {
    if (error.response && error.response.error_code === 403) {
      console.log(`Bot was blocked by user ${ctx.from.id}`);
    } else {
      console.error("Error sending start message:", error);
    }
  }
});

bot.command("menu", async (ctx) => {
  try {
    const menuMessage = `<b>🌟 GOLDESCROWBOT™ Menu</b>

    Here are the available commands:
    
    • /start - Introduction to the bot
    • /what_is_escrow - Explanation of how escrow works
    • /balance - Check the current escrow balance
    • /release - Buyer releases funds to the seller
    • /refund - Seller refunds the buyer
    • /seller &lt;BTC Address&gt; - Set yourself as the seller with a BTC address
    • /buyer &lt;BTC Address&gt; - Set yourself as the buyer with a BTC address
    
    💡 Type any of the above commands for more details.`;

    await ctx.reply(menuMessage, { parse_mode: "HTML" });
  } catch (error) {
    if (error.response && error.response.error_code === 403) {
      console.log(`Bot was blocked by user ${ctx.from.id}`);
    } else {
      console.error("Error sending menu message:", error);
    }
  }

});

bot.command("what_is_escrow", async (ctx) => {
  try {
    const escrowMessage = `
  <b>🔍 What is Escrow?</b>

  Escrow is a financial arrangement where a third party (this bot) holds and regulates payment of funds required for two parties involved in a transaction.

  <b>How it works:</b>
  • The buyer and seller agree on a deal.
  • The buyer deposits funds into escrow.
  • The seller delivers the product or service.
  • Once the buyer is satisfied, they issue the /release command to transfer funds to the seller.
  • If there's a dispute, the seller can issue the /refund command or an arbitrator can step in.

  Escrow ensures both parties are protected during the transaction.`;

    await ctx.reply(escrowMessage, { parse_mode: "HTML" });
  } catch (error) {
    if (error.response && error.response.error_code === 403) {
      console.log(`Bot was blocked by user ${ctx.from.id}`);
    } else {
      console.error("Error sending what_is_escrow message:", error);
    }
  }

});

try {
  setDefaultResultOrder("ipv4first");
  bot.launch();
} catch (err) {
  console.error(err);
}

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));