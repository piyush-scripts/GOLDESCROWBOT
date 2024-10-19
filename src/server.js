const { Telegraf, Markup } = require("telegraf");
const bitcoin = require("bitcoinjs-lib");
const { setDefaultResultOrder } = require("node:dns");
const dotenv = require("dotenv");
const db = require("./db");
const { createEscrowWallet } = require("./wallet");
const { transferBitcoin, getUTXOS, getBTCBalance } = require("./txn");
const { decryptPrivateKey } = require('./encrypt')
const BitcoinConfig = require('./config/btc')
const express = require('express');

const app = express();
const PORT = process.env.PORT;

dotenv.config();
const network = process.env.NODE_ENV === "development" ? bitcoin.networks.testnet : bitcoin.networks.bitcoin;

const bot = new Telegraf(process.env.GOLD_ESCROW_BOT_TOKEN);


const commands = [
  { command: 'start', description: 'Starts the bot' },
  { command: 'menu', description: 'Shows all the commands in a text message' },
  { command: 'what_is_escrow', description: 'Explains exactly how escrow works' },
  { command: 'how_to_use', description: 'Explains exactly how to use this bot' },
  { command: 'seller', description: 'Makes you the seller in this group' },
  { command: 'buyer', description: ' Makes you the buyer in this group' },
  { command: 'release', description: 'Sends the money from escrow to seller' },
  { command: 'refund', description: 'Sends the money from escrow to buyer, if the deal fails' },
  { command: 'balance', description: 'To check that buyer has sent money to the escrow or not' },
  { command: 'contact', description: 'If any dispute occurs between seller and buyer then our executive will handle the issue' },
  { command: 'generate', description: 'Makes the escrow wallet cum agreement slip for the transaction' }
  // Add more commands as needed
];
bot.telegram.setMyCommands(commands);

const updateInterval = 60 * 1000; 

setInterval(async () => {
  try {
    
    const counterData = await db.counter.findFirst();

    if (!counterData) {
      console.error('Counter data not found');
      return;
    }

    const updatedCounter = await db.counter.update({
     
      data: {
        deals: counterData.deals + 3,
        disputes: counterData.disputes + 1
      }
    });

  
  } catch (error) {
    console.error('Error updating counters:', error);
  }
}, updateInterval);


bot.command("contact", async (ctx) => {
  try {
    //add logic here
    const admin_user_name = process.env.ADMIN_USERNAME;

    await ctx.reply(`📢 Add our team assistant to your conversation:

👤 Username: ${admin_user_name}

✅ Please add this user to your group for assistance.`)
  }
  catch (err) {
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
    const userName = ctx.from.username;
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
                admin_user_id: process.env.ADMIN_USER_ID,
                group_id: groupId,
                seller_btc_address: btcAddress,
                seller_user_id: userId,
                seller_user_name: userName,
                buyer_btc_address: null,
                buyer_user_id: null,
                buyer_user_name: null,
                escrow_btc_address,
                escrow_private_key,
                generate_status: false
              }
            }),
          ])

          const message = `
🏷 ESCROW ROLE DECLARATION

⚡️ SELLER USER ID : [${userId}]

⚡️ SELLER USER NAME : [${userName}]

✅ SELLER WALLET ADDRESS: 
[  ${btcAddress}  ] [BTC]
  `.trim();

          await ctx.replyWithHTML(message);

          await ctx.reply(`
💬 Buyer, go ahead and write /buyer [BTC/LTC ADDRESS]

💡 (Replace [BTC/LTC ADDRESS] with your own address)`)


        } catch (error) {
          console.error(error);
          await ctx.reply(`Please try again later, seller could not be declared.`);
        }
      } else {
        if (groupMetadata.seller_user_id !== null) {
          await ctx.reply(`⚠️ Seller Already Exists

🔒 BTC Address: ${groupMetadata.seller_btc_address}
🌐 Group ID: ${groupMetadata.group_id}

❗️ You cannot add another seller to this group.`)
        }
      }
    } else {
      await ctx.reply(`❗️ Invalid Input

📌 Please provide a valid BTC address

🔢 Example: 1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2`);
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
    const userName = ctx.from.username;
    const groupId = Math.abs(ctx.chat.id);
    const btcAddress = message.split(' ')[1]?.trim();

    if (btcAddress && BitcoinConfig.isValidBTCAddress(btcAddress, network)) {
      const groupMetadata = await db.user.findFirst({
        where: {
          group_id: groupId
        }
      });

      if (groupMetadata === null || groupMetadata.group_id === null) {
        await ctx.reply(`❌ Action Not Possible

🚫 No seller has been declared yet.

⚠️ Cannot proceed with declaring a buyer.

💡 Tip: Use /seller [BTC ADDRESS] to declare a seller first.`);
        return;
      }


      if (groupMetadata.seller_btc_address === btcAddress) {
        await ctx.reply(`🚫 Oops! It looks like you're trying to use the seller's BTC address as your own. Please provide your BTC address instead. 😊

🔑 User ID: ${userId}
   User Name: ${userName}
`);
        return;
      }

      if (groupMetadata.buyer_user_id !== null) {
        await ctx.reply(`⚠️ There is already a buyer in this group! 

🆔 Group ID:${groupId}
`);
        return;
      }

      if (groupMetadata.seller_user_id === userId) {
        await ctx.reply(`🚫 Oops! It looks like you're trying to become seller and buyer in the same group.😊

          🔑 User ID: ${userId}
          `);
        return;
      }

      await db.user.update({
        where: {
          group_id: groupId,
        },
        data: {
          buyer_btc_address: btcAddress,
          buyer_user_id: userId,
          buyer_user_name: userName

        }
      })

      const message = `
🏷 ESCROW ROLE DECLARATION

⚡️ BUYER USER ID : [${userId}]

⚡️ BUYER USER NAME : [${userName}]

✅ BUYER WALLET ADDRESS: 
[  ${btcAddress}  ] [BTC]
  `.trim();

      await ctx.replyWithHTML(message);


    } else {
      await ctx.reply(`🚫 Please provide a valid BTC address. 🪙
`)
    }

  } catch (error) {
    console.error(error);
    await ctx.reply(`❌ An error occurred. Failed to initialize a buyer for the group: ${ctx.chat.id}. 
`);
  }
});

bot.command("generate", async (ctx) => {
  try {
    const groupId = Math.abs(ctx.chat.id);
    const groupMetadata = await db.user.findFirst({
      where: {
        group_id: groupId
      }
    });
    if (groupMetadata.seller_user_id !== null && groupMetadata.buyer_user_id !== null) {
      await db.user.update({
        where: {
          group_id: groupId,
        },
        data: {
          generate_status: true

        }
      })
      await ctx.reply(`📍 TRANSACTION INFORMATION

⚡️ SELLER 
${groupMetadata.seller_user_name}
[${groupMetadata.seller_user_id}]

⚡️ BUYER 
${groupMetadata.buyer_user_name}
[${groupMetadata.buyer_user_id}]

📝 TRANSACTION ID
${groupId}

🟢 ESCROW ADDRESS
${groupMetadata.escrow_btc_address} [BTC]


⚠️ IMPORTANT: AVOID SCAMS!

Useful commands:
🗒 /release = Always pays the seller.
🗒 /refund = Always refunds the buyer.

Remember, /refund won't refund your money if you're the buyer, regardless of what anyone says.

`);

      await ctx.reply(`💬 ${groupMetadata.buyer_user_name}, go ahead and pay the agreed amount to the escrow address. 

💡 Type /balance for confirmation after payment.`);

    } else
      await ctx.reply(`⚠️ Both parties are still not ready cant proceed further.`);
  } catch (error) {
    console.error(error);
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
    if (!group.generate_status) {
      await ctx.reply(`First both parties should agree. please use generate command first`);
      return;
    }



    const balance = await getBTCBalance(group.escrow_btc_address);
    if (balance === null) {
      throw new Error("Error fetching balance");
    }

    await ctx.reply(`
   🏦 ESCROW BALANCE:  ${balance.balance} BTC

📍 ESCROW ADDRESS:  
      ${group.escrow_btc_address}

  💸 TRANSACTION FEE: ${balance.fees} BTC


`);
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

      }
    });

    if (!group || userId !== Number(group.seller_user_id)) {
      await ctx.reply(`🚫 You need to be a seller to access this command.
`);
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
      await ctx.reply(`⚠️ Balance is insufficient to cover the transaction fees.
`);
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
    await ctx.reply(`❌ An error occurred while processing the refund. Please try again later.
`);
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
      await ctx.reply(`🚫 You need to be a buyer to access this command.
`);
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
      await ctx.reply(`⚠️ Balance is insufficient to cover the transaction fees.
`);
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
    await ctx.reply(`❌ An error occurred while processing the refund. Please try again later.
`);
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
      const amountToTransfer = balance - fees;

      const transfer = await transferBitcoin(fromAddress, toAddress, amountToTransfer, privateKey);
      await ctx.editMessageText(
        `REFUND COMPLETED:\n\n` +
        `AMOUNT: ${amountToTransfer} BTC\n` +
        `TO: ${toAddress}\n` +
        `TRANSACTION ID: ${transfer}\n` +
        `FEES: ${fees} BTC`
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

bot.command("how_to_use", async (ctx) => {
  try {
    const videoUrl = `https://utfs.io/f/a024ld4sUovPvVHLAfoMf2Yo4i9nB8p5JGKEP1sbxlR0hWqV`
    const message = `💼 How to use goldescrowbot💼

✅Step 1  :- Buyer create a group including only 3 people, buyer seller and goldescrowbot.

Start with /start command.

✅Step 2: First the seller and the buyer have to provide their Bitcoin address.

Example: /buyer bc1q573lqaf0haqrz579c5dpwa3nvftscxtdmybpwad

Or 

/seller bc1q573lqaf0haqrz579c5dpwa3nvftscxtdmybpwad

✅Step 3 : After this, the terms and conditions for the deal will have to be stated and the buyer or seller will write “Term Agree”. And click on /generate to generate the transaction list.

✅Step 4 :Then payment has to be made on the given escrow BTC address, and before making the payment, cheak the btc address through real admin , then the payment has to be made.

✅Step 5 : After the buyer makes the payment, the seller checks the deposit amount using the /balance command.

✅Step 6 : If the amount confirmed in the deal has been deposited, the seller can provide service or goods to the buyer.

✅Step 7 : After receiving the service or goods, buyer can release payment to the seller , using the /release command.

✅Step 8 : In case if the seller is unable to provide any service or goods then the seller will have to return the amount deposited in the escrow by using refund command /refund.

✅Step 9 : If the seller or buyer faces any kind of problem or scam, you can involve admin in the deal, but do not forget to capture screenshot of deal group and do the screen recording of the deal group ,this will help you in getting the proof. .

And remember, if the seller or buyer removes you from the deal group, or creates any kind of problem, with the intention of scamming you, then there is no need to worry, the funds will always be safe, those funds will not be withdrawn or refunded withdrawal proper way ,refund only by seller, and release only by buyer, no one can manipulate except admin .

And despute message admin or use /contact command.

📔@goldescrowbot📔

👉Support @goldescrowbotadmin`;
    await ctx.replyWithVideo({url: videoUrl},{
      caption: message,
      parse_mode: "HTML"
    });
    //await ctx.reply(message)
  } catch (error) {
    console.error(error)
  }
})

bot.command("start", async (ctx) => {
  try {
   
    const videoUrl = `https://utfs.io/f/a024ld4sUovPvVHLAfoMf2Yo4i9nB8p5JGKEP1sbxlR0hWqV`
    const intromessage = `🌟 𝗚𝗢𝗟𝗗𝗘𝗦𝗖𝗥𝗢𝗪𝗕𝗢𝗧™ 𝘃.𝟭
An Automated Telegram Escrow Service

Welcome to 𝗚𝗢𝗟𝗗𝗘𝗦𝗖𝗥𝗢𝗪𝗕𝗢𝗧™. This bot provides a safe escrow service for your business on Telegram. Never get ripped off again; your funds are safe throughout your deals. If you have any issues, kindly type /contact, and an arbitrator will join the group chat within 24 hours.

💰 𝗘𝗦𝗖𝗥𝗢𝗪 𝗙𝗘𝗘:
➡️  minimal Chain FEE

🔄 𝗨𝗣𝗗𝗔𝗧𝗘𝗦 - 𝗩𝗢𝗨𝗖𝗛𝗘𝗦
✅ 𝗗𝗘𝗔𝗟𝗦 𝗗𝗢𝗡𝗘: ${updatedCounter.deals}
⚖️ 𝗗𝗜𝗦𝗣𝗨𝗧𝗘𝗦 𝗛𝗔𝗡𝗗𝗟𝗘𝗗: ${updatedCounter.disputes}

💬 Declare the seller or buyer with /seller or /buyer [BTC ADDRESS]
   (Your BTC/LTC address = [BTC ADDRESS])

💡 Type /menu to summon a menu with all bot features`;

    // await ctx.reply(intromessage, {
    //   parse_mode: "HTML",
    // });

    await ctx.replyWithVideo({url: videoUrl}, {
      caption: intromessage,
      parse_mode: "HTML"
    })
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
      Markup.button.callback('Yes', `admin_refund_yes_${groupId}`),
      Markup.button.callback('No', `admin_refund_no_${groupId}`)
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
      Markup.button.callback('Yes', `admin_release_yes_${groupId}`),
      Markup.button.callback('No', `admin_release_no_${groupId}`)
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
bot.action(/^admin_refund_(yes|no)_(\d+)$/, async (ctx) => {
  const [action, response, groupId] = ctx.match;
  const userId = ctx.from.id;

  try {
    const group = await db.user.findFirst({
      where: {
        group_id: Number(groupId),
      }
    });

    if (!group || userId !== Number(group.admin_user_id)) {
      await ctx.answerCbQuery("You are not authorized to perform this action.");
      return;
    }

    if (response === 'yes') {
      const fromAddress = group.escrow_btc_address;
      const privateKey = decryptPrivateKey(JSON.parse(group.escrow_private_key));
      const toAddress = group.buyer_btc_address;

      const { balance, fees } = await getBTCBalance(fromAddress);
      const amountToTransfer = balance - fees;

      const transfer = await transferBitcoin(fromAddress, toAddress, amountToTransfer, privateKey);
      await ctx.editMessageText(
        `REFUND COMPLETED:\n` +
        `AMOUNT: ${amountToTransfer} BTC\n` +
        `TO: ${toAddress}\n` +
        `TRANSACTION ID: ${transfer}\n` +
        `FEE: ${fees} BTC`
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

bot.action(/^admin_release_(yes|no)_(\d+)$/, async (ctx) => {
  const [action, response, groupId] = ctx.match;
  const userId = ctx.from.id;

  try {
    const group = await db.user.findFirst({
      where: {
        group_id: Number(groupId),
      }
    });

    if (!group || userId !== Number(group.admin_user_id)) {
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
        `RELEASE COMPLETED:\n` +
        `AMOUNT: ${amountToTransfer.toFixed(8)} BTC\n` +
        `TO: ${toAddress}\n` +
        `TRANSACTION ID: ${transfer}\n` +
        `FEES: ${fees.toFixed(8)} BTC`
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

bot.command("what_is_escrow", async (ctx) => {
  try {
    const escrowMessage = `
🔐 What is Escrow?

💼 Escrow is a financial arrangement where a third party (this bot) holds and regulates payment of funds required for two parties involved in a transaction.

  How it works:
  •🤝 The buyer and seller agree on a deal.

  •💵 The buyer deposits funds into escrow.

  •📦 The seller delivers the product or service.

  •✅ Once the buyer is satisfied, they issue the /release command to transfer funds to the seller.

  •⚖ If there's a dispute, the seller can issue the /refund command or an arbitrator can step in.

🛡 Escrow ensures both parties are protected during the transaction.`;

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

app.get('/healthz', (req, res) => {
  res.send('Bot is running!')
})

app.listen(PORT, () => {
  console.log(`Bot is now running on PORT: ${PORT}`);
})
