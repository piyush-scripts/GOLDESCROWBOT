const { Telegraf, Markup } = require("telegraf");
const bitcoin = require("bitcoinjs-lib");
const { setDefaultResultOrder } = require("node:dns");
const dotenv = require("dotenv");
const db = require("./db");
const { createEscrowWallet } = require("./wallet");
const { transferBitcoin, getUTXOS, getBTCBalance } = require("./txn");
const { decryptPrivateKey } = require('./encrypt')
const BitcoinConfig = require('./config/btc')
const express = require('express')

const app = express();
const PORT = process.env.PORT;

dotenv.config();
const network = process.env.NODE_ENV === "development" ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

const bot = new Telegraf(process.env.GOLD_ESCROW_BOT_TOKEN);


const commands = [
  { command: 'start', description: 'Starts the bot' },
  { command: 'menu', description: 'Shows all the commands in a text message' },
  { command: 'what_is_escrow', description: 'Explains exactly how escrow works' },
  { command: 'seller', description: 'Makes you the seller in this group' },
  { command: 'buyer', description: ' Makes you the buyer in this group' },
  { command: 'release', description: 'Sends the money from escrow to seller' },
  { command: 'refund', description: 'Sends the money from escrow to buyer, if the deal fails' },
  { command: 'balance', description: 'To check that buyer has sent money to the escrow or not' },
  { command: 'contact', description: 'If any dispute occurs between seller and buyer then our executive will handle the issue' },
  // Add more commands as needed
];

// Set the commands for your bot
bot.telegram.setMyCommands(commands);


bot.command("contact", async (ctx)=>{
try{
  //add logic here
  const admin_user_id = 362795;
  const admin_user_name = "rand_user_name";
  await ctx.reply("Add this ${admin_user_id} to your group")
}
catch (err){
  console.error(err);
}




});




bot.command("menu", async (ctx) => {
  try {
    const menuMessage = `# 🤖 Escrow Bot Commands

Here's a list of all available commands to help you use our Escrow Bot:

📌 /start - Get introduced to the bot

💡 /what_is_escrow - Learn how escrow works

💰 /balance - Check your current escrow balance

✅ /release - Buyer releases funds to the seller

🔄 /refund - Seller refunds the buyer

🆘 /contact - Get help from our team for disputes

👨‍💼 /seller <BTC Address> - Set yourself as the seller

🛒 /buyer <BTC Address> - Set yourself as the buyer

Remember to replace <BTC Address> with your actual Bitcoin address when using the /seller or /buyer commands.

Need help? Don't hesitate to use the /contact command!`;

    await ctx.reply(menuMessage);
  } catch (error) {
    if (error.response && error.response.error_code === 403) {
      console.log(`Bot was blocked by user ${ctx.from.id}`);
    } else {
      console.error("Error sending menu message:", error);
    }
  }

});





bot.command("seller", async (ctx) => {
  try {
    const message = ctx.message.text;
    const groupId = Math.abs(ctx.chat.id);
    const userId = BigInt(ctx.from.id);
    const btcAddress = message.split(' ')[1]?.trim();

    if (btcAddress && BitcoinConfig.isValidBTCAddress(btcAddress, network)) {
      const groupMetadata = await db.user.findFirst({
        where: {
          group_id: BigInt(groupId)
        }
      });

      if (!groupMetadata || !groupMetadata.group_id) {
        try {
          const escrow = await createEscrowWallet(groupId);
          if (escrow === null) {
            await ctx.reply(`Escrow wallet could not be generated`);
            return;
          }
          const { escrow_btc_address, escrow_private_key } = escrow;
          await db.$transaction([
            db.user.create({
              data: {
                //edit
                admin_user_id:5261937,
                group_id: groupId,
                seller_btc_address: btcAddress,
                seller_user_id: userId,
                buyer_btc_address: null,
                buyer_user_id: null,
                escrow_btc_address,
                escrow_private_key
              }
            }),
          ])

          await ctx.reply(`Seller initialised with the btc address: (${btcAddress})\n To check escrow address, input /balance .`);
        } catch (error) {
          console.error(error);
          await ctx.reply(`Please try again later, seller could not be declared.`);
        }
      } else {
        if (groupMetadata.seller_user_id !== null) {
          await ctx.reply(`A seller with the btc address: (${groupMetadata.seller_btc_address}) already exists in group: (${groupMetadata.group_id})`)
        }
      }
    } else {
      await ctx.reply(`Please provide a valid BTC address`);
    }

  } catch (error) {
    console.error(error);
    await ctx.reply(`Some error occurred seller not initialized`);
  }
});

bot.command("buyer", async (ctx) => {
  try {
    const message = ctx.message.text;
    const userId = BigInt(ctx.from.id);
    const groupId = Math.abs(ctx.chat.id);
    const btcAddress = message.split(' ')[1]?.trim();

    if (btcAddress && BitcoinConfig.isValidBTCAddress(btcAddress, network)) {
      const groupMetadata = await db.user.findFirst({
        where: {
          group_id: groupId
        }
      });
      
      if (groupMetadata === null || groupMetadata.group_id === null) {
        await ctx.reply(`Currently there is no seller declared cannot proceed with declaring buyer`);
        return;
      }


      if (groupMetadata.seller_btc_address === btcAddress) {
        await ctx.reply(`You are using seller's BTC Address as your address, please provide your own address, userId: ${userId}`);
        return;
      }

      if (groupMetadata.buyer_user_id !== null) {
        await ctx.reply(`There already exists a buyer in this group: ${groupId}`);
        return;
      }

      await db.user.update({
        where: {
          group_id: groupId,
        },
        data: {
          buyer_btc_address: btcAddress,
          buyer_user_id: userId
        }
      })

      await ctx.reply(`Buyer initialised, with BTC Address: ${btcAddress}, to send BTC to escrow, type /balance .`);

    } else {
      await ctx.reply(`Please provide a valid BTC Address`)
    }

  } catch (error) {
    console.error(error);
    await ctx.reply(`Some error occurred, failed to initialise a buyer for the group: ${ctx.chat.id}`);
  }
});

bot.command("balance", async (ctx) => {
  try {
    const groupId = Math.abs(ctx.chat.id);

    const group = await db.user.findFirst({
      where: {
        group_id: groupId,
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

    await ctx.reply(`Balance of current escrow (${group.escrow_btc_address}): ${balance.balance} BTC,\n fees: ${balance.fees}`);
  } catch (error) {
    console.error("Error in balance command:", error);
    await ctx.reply("An error occurred while fetching balance of escrow");
  }
});
bot.command("refund", async (ctx) => {
  try {
    const userId = ctx.from.id;
    const groupId = Math.abs(ctx.chat.id);
    
    const group = await db.user.findFirst({
      where: {
        group_id: groupId,
        seller_user_id: userId,
      }
    });

    if (!group || userId !== Number(group.seller_user_id)) {
      await ctx.reply("You need to be a seller to access this command.");
      return;
    }

    const fromAddress = group.escrow_btc_address;
    const privateKey = decryptPrivateKey(JSON.parse(group.escrow_private_key));
    const toAddress = group.buyer_btc_address;

    const { balance, fees } = await getBTCBalance(fromAddress);

    if (balance <= 0) {
      await ctx.reply("Insufficient balance to proceed.");
      return;
    }

    if (balance <= fees) {
      await ctx.reply("Balance is insufficient to cover the transaction fees.");
      return;
    }

    const inlineKeyboard = Markup.inlineKeyboard([
      Markup.button.callback('Yes', `refund_yes_${groupId}`),
      Markup.button.callback('No', `refund_no_${groupId}`)
    ]);

    await ctx.reply(
      `Do you want to refund the following amount?\n\n` +
      `Balance: ${balance.toFixed(8)} BTC\n` +
      `Fees: ${fees.toFixed(8)} BTC\n` +
      `To: ${toAddress}`,
      inlineKeyboard
    );

  } catch (error) {
    console.error("Error in refund command:", error);
    await ctx.reply("An error occurred while processing the refund. Please try again later.");
  }
});

bot.command("release", async (ctx) => {
  try {
    const userId = ctx.from.id;
    const groupId = Math.abs(ctx.chat.id);

    const group = await db.user.findFirst({
      where: {
        group_id: groupId,
      }
    });

    if (!group || userId !== Number(group.buyer_user_id)) {
      await ctx.reply("You need to be a buyer to access this command.");
      return;
    }

    const fromAddress = group.escrow_btc_address;
    const toAddress = group.seller_btc_address;

    const { balance, fees } = await getBTCBalance(fromAddress);

    if (balance <= 0) {
      await ctx.reply("Insufficient balance to proceed.");
      return;
    }

    if (balance <= fees) {
      await ctx.reply("Balance is insufficient to cover the transaction fees.");
      return;
    }

    const inlineKeyboard = Markup.inlineKeyboard([
      Markup.button.callback('Yes', `release_yes_${groupId}`),
      Markup.button.callback('No', `release_no_${groupId}`)
    ]);

    await ctx.reply(
      `Do you want to release the following amount?\n\n` +
      `Balance: ${balance.toFixed(8)} BTC\n` +
      `Fees: ${fees.toFixed(8)} BTC\n` +
      `To: ${toAddress}`,
      inlineKeyboard
    );

  } catch (error) {
    console.error("Error in release command:", error);
    await ctx.reply("An error occurred while processing the release. Please try again later.");
  }
});

// Handle callback queries
bot.action(/^refund_(yes|no)_(\d+)$/, async (ctx) => {
  const [action, response, groupId] = ctx.match;
  const userId = ctx.from.id;

  try {
    const group = await db.user.findFirst({
      where: {
        group_id: Number(groupId),
      }
    });

    if (!group || userId !== Number(group.seller_user_id)) {
      await ctx.answerCbQuery("You are not authorized to perform this action.");
      return;
    }

    if (response === 'yes') {
      const fromAddress = group.escrow_btc_address;
      const privateKey = decryptPrivateKey(JSON.parse(group.escrow_private_key));
      const toAddress = group.buyer_btc_address;

      const { balance, fees } = await getBTCBalance(fromAddress);
      const amountToTransfer = BitcoinConfig.BTCToSatoshis(balance) - BitcoinConfig.BTCToSatoshis(fees);

      const transfer = await transferBitcoin(fromAddress, toAddress, BitcoinConfig.satoshisToBTC(amountToTransfer), privateKey);
      await ctx.editMessageText(
        `Refund completed:\n\n` +
        `Amount: ${amountToTransfer} BTC\n` +
        `To: ${toAddress}\n` +
        `Transaction ID: ${transfer}\n` +
        `Fees: ${fees} BTC`
      );
    } else {
      await ctx.editMessageText("Refund cancelled.");
    }

    await ctx.answerCbQuery();
  } catch (error) {
    console.error("Error in refund action:", error);
    await ctx.answerCbQuery("An error occurred. Please try again later.");
  }
});

bot.action(/^release_(yes|no)_(\d+)$/, async (ctx) => {
  const [action, response, groupId] = ctx.match;
  const userId = ctx.from.id;

  try {
    const group = await db.user.findFirst({
      where: {
        group_id: Number(groupId),
      }
    });

    if (!group || userId !== Number(group.buyer_user_id)) {
      await ctx.answerCbQuery("You are not authorized to perform this action.");
      return;
    }

    if (response === 'yes') {
      const fromAddress = group.escrow_btc_address;
      const privateKey = decryptPrivateKey(JSON.parse(group.escrow_private_key));
      const toAddress = group.seller_btc_address;

      const { balance, fees } = await getBTCBalance(fromAddress);
      const amountToTransfer = balance - fees;

      const transfer = await transferBitcoin(fromAddress, toAddress, amountToTransfer, privateKey);
      await ctx.editMessageText(
        `Release completed:\n\n` +
        `Amount: ${amountToTransfer.toFixed(8)} BTC\n` +
        `To: ${toAddress}\n` +
        `Transaction ID: ${transfer}\n` +
        `Fees: ${fees.toFixed(8)} BTC`
      );
    } else {
      await ctx.editMessageText("Release cancelled.");
    }

    await ctx.answerCbQuery();
  } catch (error) {
    console.error("Error in release action:", error);
    await ctx.answerCbQuery("An error occurred. Please try again later.");
  }
});

bot.command("start", async (ctx) => {
  try {
    const intromessage = `<b>🌟 GOLDESCROWBOT™ v.1</b>
      An Automated Telegram Escrow Service
      
      Welcome to <b>GOLDESCROWBOT™</b>. This bot provides a safe escrow service for your business on Telegram. Never get ripped off again; your funds are safe throughout your deals. If you have any issues, kindly type /contact, and an arbitrator will join the group chat within 24 hours.
      
      <b>💰 ESCROW FEE:</b>
      =>  minimal Chain FEE
      
      <b>🔄 UPDATES - VOUCHES</b>
      <b>✔️ DEALS DONE:</b> 8788
      <b>⚖️ DISPUTES HANDLED:</b> 732
      
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


bot.command("admin_refund", async (ctx) => {
  try {
    const AdminUserId = ctx.from.id;
    const groupId = Math.abs(ctx.chat.id);
    
    const group = await db.user.findFirst({
      where: {
        group_id: groupId,
        admin_user_id: AdminUserId,
      }
    });
    
    if (!group || AdminUserId !== Number(group.admin_user_id)) {
      await ctx.reply("You need to be an Admin to access this command.");
      return;
    }
    
    const fromAddress = group.escrow_btc_address;
    const privateKey = decryptPrivateKey(JSON.parse(group.escrow_private_key));
    const toAddress = group.buyer_btc_address;
    
    const { balance, fees } = await getBTCBalance(fromAddress);
    
    if (balance <= 0) {
      await ctx.reply("Insufficient balance to proceed.");
      return;
    }
    
    if (balance <= fees) {
      await ctx.reply("Balance is insufficient to cover the transaction fees.");
      return;
    }
    
    const inlineKeyboard = Markup.inlineKeyboard([
      Markup.button.callback('Yes', `refund_yes_${groupId}`),
      Markup.button.callback('No', `refund_no_${groupId}`)
    ]);
    
    await ctx.reply(
      `Do you want to refund the following amount?\n\n` +
      `Balance: ${balance.toFixed(8)} BTC\n` +
      `Fees: ${fees.toFixed(8)} BTC\n` +
      `To: ${toAddress}`,
      inlineKeyboard
    );
  } catch (error) {
    console.error("Error in refund command:", error);
    await ctx.reply("An error occurred while processing the refund. Please try again later.");
  }
});

bot.command("admin_release", async (ctx) => {
  try {
    const AdminUserId = ctx.from.id;
    const groupId = Math.abs(ctx.chat.id);
    
    const group = await db.user.findFirst({
      where: {
        group_id: groupId,
      }
    });
    
    if (!group || AdminUserId !== Number(group.admin_user_id)) {
      await ctx.reply("You need to be an admin to access this command.");
      return;
    }
    
    const fromAddress = group.escrow_btc_address;
    const toAddress = group.seller_btc_address;
    
    const { balance, fees } = await getBTCBalance(fromAddress);
    
    if (balance <= 0) {
      await ctx.reply("Insufficient balance to proceed.");
      return;
    }
    
    if (balance <= fees) {
      await ctx.reply("Balance is insufficient to cover the transaction fees.");
      return;
    }
    
    const inlineKeyboard = Markup.inlineKeyboard([
      Markup.button.callback('Yes', `release_yes_${groupId}`),
      Markup.button.callback('No', `release_no_${groupId}`)
    ]);
    
    await ctx.reply(
      `Do you want to release the following amount?\n\n` +
      `Balance: ${balance.toFixed(8)} BTC\n` +
      `Fees: ${fees.toFixed(8)} BTC\n` +
      `To: ${toAddress}`,
      inlineKeyboard
    );
  } catch (error) {
    console.error("Error in release command:", error);
    await ctx.reply("An error occurred while processing the release. Please try again later.");
  }
});

// Action handlers for inline keyboard buttons
bot.action(/^refund_yes_(\d+)$/, async (ctx) => {
  const groupId = ctx.match[1];
  // Implement the refund logic here
  await ctx.answerCbQuery();
  await ctx.editMessageText('Refund process initiated. Please wait for confirmation.');
});

bot.action(/^refund_no_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('Refund cancelled.');
});

bot.action(/^release_yes_(\d+)$/, async (ctx) => {
  const groupId = ctx.match[1];
  // Implement the release logic here
  await ctx.answerCbQuery();
  await ctx.editMessageText('Release process initiated. Please wait for confirmation.');
});

bot.action(/^release_no_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.editMessageText('Release cancelled.');
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

app.get('/healthz', (req, res)=> {
  res.send('Bot is running!')
})

app.listen(PORT, ()=> {
  console.log(`Bot is now running on PORT: ${PORT}`);
})