const { Telegraf, Markup } = require('telegraf');
const QRCode = require('qrcode');
const express = require('express');
const axios = require('axios');
const { botToken, qrisCode } = require('./config/config');
const QrisAPI = require('./handlers/qrisAPI');
const { isAdmin } = require('./middleware/auth');
const { getAllCategories } = require('./database/categories');
const { getProductsByCategory } = require('./database/products');
const { getStockCount, useStock } = require('./database/stocks');

const startHandler = require('./handlers/start');
const balanceHandler = require('./handlers/user/balance');
const broadcastHandler = require('./handlers/admin/broadcast');
const addCategoryHandler = require('./handlers/admin/addcategory');
const delCategoryHandler = require('./handlers/admin/delcategory');
const listCategoryHandler = require('./handlers/admin/listcategory');
const addProductHandler = require('./handlers/admin/addproduct');
const listProdukHandler = require('./handlers/admin/listproduk');
const addStokHandler = require('./handlers/admin/addstok');
const delStokHandler = require('./handlers/admin/delstok');
const cekStokHandler = require('./handlers/admin/cekstok');
const changePhotoHandler = require('./handlers/admin/changephoto');

const bot = new Telegraf(botToken);
const app = express();
const qrisAPI = new QrisAPI();
const editQtyState = {};
const depositState = {}; // Track users in deposit flow

const safeEditMessage = async (ctx, text, extra) => {
  try {
    await ctx.editMessageCaption(text, extra);
  } catch (error) {
    if (error.description?.includes('message is not modified')) {
      return;
    }
    throw error;
  }
};

const generateDynamicQRIS = async (amount, orderId) => {
  try {
    const data = {
      qrisCode: qrisCode,
      nominal: amount.toString(),
      feeType: 'r',
      fee: '0',
      includeFee: false
    };

    console.log(`🔄 Generating dynamic QRIS for Rp ${amount.toLocaleString('id-ID')}...`);
    console.log('   Request data:', JSON.stringify(data, null, 2));
    
    const response = await axios.post(
      'https://qris-statis-to-dinamis.vercel.app/generate-qris',
      data,
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      }
    );

    console.log('   API Response status:', response.status);
    console.log('   API Response data keys:', Object.keys(response.data || {}));
    
    if (!response.data?.qrCode) {
      console.log('   ❌ No qrCode in response:', response.data);
      throw new Error('Failed to generate QRIS - no qrCode in response');
    }

    // Decode and verify QRIS content
    const qrBuffer = Buffer.from(response.data.qrCode.split(',')[1], 'base64');
    const qrString = qrBuffer.toString('utf8');
    
    // Check if amount is in QRIS string (tag 54 = transaction amount)
    // Format: 54 + length(2 digits) + amount value
    const tag54Match = qrString.match(/54(\d{2})/);
    if (tag54Match) {
      const length = parseInt(tag54Match[1]);
      const tag54Index = qrString.indexOf(tag54Match[0]);
      const amountValue = qrString.substr(tag54Index + 4, length);
      console.log(`✅ Dynamic QRIS generated - Amount in QR: ${amountValue} (expected: ${amount})`);
      
      if (parseInt(amountValue) !== amount) {
        console.log('⚠️  WARNING: Amount mismatch in QRIS!');
      }
    } else {
      console.log('⚠️  Tag 54 (amount) not found - QRIS might be static!');
    }
    
    return qrBuffer;

  } catch (error) {
    console.error('❌ Error generating dynamic QRIS:', error.message);
    if (error.response) {
      console.error('   API Error response:', error.response.data);
    }
    throw error;
  }
};

const findProduct = (productId) => {
  const categories = getAllCategories();
  for (const cat of categories) {
    const products = getProductsByCategory(cat.name);
    const product = products.find(p => p.id === productId);
    if (product) return product;
  }
  return null;
};

const buildCategoryButtons = (categories, page = 0, maxPerPage = 5) => {
  const startIndex = page * maxPerPage;
  const endIndex = startIndex + maxPerPage;
  const pageCategories = categories.slice(startIndex, endIndex);
  
  const buttons = [];
  
  // Category buttons (2 per row)
  for (let i = 0; i < pageCategories.length; i += 2) {
    const row = [];
    const globalIndex = startIndex + i;
    row.push(Markup.button.callback(`${globalIndex + 1}`, `cat_${pageCategories[i].id}`));
    if (pageCategories[i + 1]) {
      row.push(Markup.button.callback(`${globalIndex + 2}`, `cat_${pageCategories[i + 1].id}`));
    }
    buttons.push(row);
  }
  
  // Pagination buttons
  if (categories.length > maxPerPage) {
    const navRow = [];
    const totalPages = Math.ceil(categories.length / maxPerPage);
    
    if (page > 0) {
      navRow.push(Markup.button.callback('◀️ Prev', `page_${page - 1}`));
    }
    
    navRow.push(Markup.button.callback(`${page + 1}/${totalPages}`, 'page_info'));
    
    if (page < totalPages - 1) {
      navRow.push(Markup.button.callback('Next ▶️', `page_${page + 1}`));
    }
    
    buttons.push(navRow);
  }
  
  return buttons;
};

const showProductMessage = async (ctx, productId, qty, isEdit = true) => {
  const product = findProduct(productId);
  if (!product) return ctx.answerCbQuery('Produk tidak ditemukan');
  
  const total = product.price * qty;
  const stockCount = product.code ? getStockCount(product.code) : 0;
  const message = `🛒 ${product.name}\n🔖 Code: ${product.code || '-'}\n📊 Stok: ${stockCount}\n\n💰 Harga Satuan: Rp ${product.price.toLocaleString('id-ID')}\n📦 Jumlah: ${qty}\n💵 Total: Rp ${total.toLocaleString('id-ID')}\n📝 ${product.detail}\n\nPilih metode pembayaran:`;
  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('➖', `qty_min_${product.id}_${qty}`), Markup.button.callback('✏️', `qty_edit_${product.id}_${qty}`), Markup.button.callback('➕', `qty_plus_${product.id}_${qty}`)],
    [Markup.button.callback('💰 Saldo', `pay_saldo_${product.id}_${qty}`), Markup.button.callback('📱 QRIS', `pay_qris_${product.id}_${qty}`)],
    [Markup.button.callback('🔙 Kembali', 'back_home')]
  ]);
  
  if (isEdit) {
    await safeEditMessage(ctx, message, keyboard);
  } else {
    // Dynamic load for runtime changes
    delete require.cache[require.resolve('./config/config')];
    const currentPhotoUrl = require('./config/config').photoUrl;
    await ctx.replyWithPhoto(currentPhotoUrl, { caption: message, ...keyboard });
  }
};

bot.start(startHandler);

bot.command('saldo', balanceHandler);
bot.command('balance', balanceHandler);

bot.command('broadcast', isAdmin, broadcastHandler);
bot.command('addcategory', isAdmin, addCategoryHandler);
bot.command('delcategory', isAdmin, delCategoryHandler);
bot.command('listcategory', isAdmin, listCategoryHandler);
bot.command('addproduk', isAdmin, addProductHandler);
bot.command('listproduk', isAdmin, listProdukHandler);
bot.command('addstok', isAdmin, addStokHandler);
bot.command('delstok', isAdmin, delStokHandler);
bot.command('cekstok', isAdmin, cekStokHandler);
bot.command('gantifoto', isAdmin, changePhotoHandler);

bot.action(/^cat_(.+)$/, async (ctx) => {
  const categoryId = parseInt(ctx.match[1]);
  const categories = getAllCategories();
  const category = categories.find(cat => cat.id === categoryId);
  
  if (category) {
    await ctx.answerCbQuery();
    const products = getProductsByCategory(category.name);
    
    if (products.length > 0) {
      let message = `📦 Kategori: ${category.name}\n\n`;
      products.forEach((prod, idx) => {
        const stock = prod.code ? getStockCount(prod.code) : 0;
        message += `${idx + 1}. ${prod.name}\n`;
        message += `   💰 Harga: Rp ${prod.price.toLocaleString('id-ID')}\n`;
        message += `   📊 Stok: ${stock}\n`;
        message += `   📝 ${prod.detail}\n\n`;
      });
      
      const buttons = [];
      for (let i = 0; i < products.length; i += 2) {
        const row = [];
        row.push(Markup.button.callback(`${i + 1}`, `prod_${products[i].id}`));
        if (products[i + 1]) {
          row.push(Markup.button.callback(`${i + 2}`, `prod_${products[i + 1].id}`));
        }
        buttons.push(row);
      }
      buttons.push([Markup.button.callback('🔙 Kembali', 'back_home')]);
      
      await safeEditMessage(ctx, message, Markup.inlineKeyboard(buttons));
    } else {
      await safeEditMessage(ctx, `📦 Kategori: ${category.name}\n\n❌ Belum ada produk.`, 
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_home')]]));
    }
  } else {
    ctx.answerCbQuery('Kategori tidak ditemukan');
  }
});

bot.action(/^prod_(.+)_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await showProductMessage(ctx, parseFloat(ctx.match[1]), parseInt(ctx.match[2]));
});

bot.action(/^prod_(.+)$/, async (ctx) => {
  const productId = parseFloat(ctx.match[1]);
  ctx.editMessageCaption = ctx.editMessageCaption;
  await ctx.answerCbQuery();
  const newCallback = `prod_${productId}_1`;
  ctx.match = newCallback.match(/^prod_(.+)_(\d+)$/);
  return bot.handleUpdate({...ctx.update, callback_query: {...ctx.callbackQuery, data: newCallback}});
});

bot.action(/^qty_plus_(.+)_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  await showProductMessage(ctx, parseFloat(ctx.match[1]), parseInt(ctx.match[2]) + 1);
});

bot.action(/^qty_min_(.+)_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
  const qty = Math.max(1, parseInt(ctx.match[2]) - 1);
  await showProductMessage(ctx, parseFloat(ctx.match[1]), qty);
});

bot.action(/^qty_edit_(.+)_(\d+)$/, async (ctx) => {
  const productId = parseFloat(ctx.match[1]);
  await ctx.answerCbQuery('Kirim jumlah yang diinginkan (angka saja)');
  editQtyState[ctx.from.id] = { productId: productId };
});

bot.action(/^qty_(?!min_|plus_|edit_)(.+)_(\d+)$/, async (ctx) => {
  await ctx.answerCbQuery();
});

// Deposit keyboard handler
bot.hears('💳 Deposit Saldo', async (ctx) => {
  // Find the last message with photo to edit
  const message = 
    `💳 *ᴅᴇᴘᴏꜱɪᴛ ꜱᴀʟᴅᴏ*\n\n` +
    `💰 Silakan masukkan jumlah deposit yang ingin Anda top-up.\n\n` +
    `📝 *ᴄᴀʀᴀ ᴅᴇᴘᴏꜱɪᴛ:*\n` +
    `1️⃣ Kirim jumlah deposit (contoh: 10000)\n` +
    `2️⃣ Bot akan generate QRIS otomatis\n` +
    `3️⃣ Scan & bayar sesuai nominal\n` +
    `4️⃣ Saldo otomatis masuk!\n\n` +
    `⚠️ *Minimum deposit: Rp 1.000*\n` +
    `⚠️ Kirim angka saja (tanpa titik/koma)\n\n` +
    `💡 Contoh: 10000`;
  
  // Reply with instruction and keep keyboard
  await ctx.reply(message, { 
    parse_mode: 'Markdown',
    reply_markup: Markup.keyboard([
      [Markup.button.text('🔙 Kembali ke Menu')],
      [Markup.button.text('📖 Cara Order'), Markup.button.text('👤 Admin')],
      [Markup.button.text('📦 All Stock')]
    ]).resize().reply_markup
  });
  
  // Set deposit state
  depositState[ctx.from.id] = { waitingAmount: true };
});

// Cara Order handler
bot.hears('📖 Cara Order', async (ctx) => {
  const message = 
    `📖 *ᴄᴀʀᴀ ᴏʀᴅᴇʀ*\n\n` +
    `*1️⃣ ᴘɪʟɪʜ ᴋᴀᴛᴇɢᴏʀɪ*\n` +
    `   • Klik nomor kategori dari menu utama\n` +
    `   • Lihat daftar produk yang tersedia\n\n` +
    `*2️⃣ ᴘɪʟɪʜ ᴘʀᴏᴅᴜᴋ*\n` +
    `   • Klik nomor produk yang diinginkan\n` +
    `   • Atur jumlah dengan ➕ ➖ atau ✏️\n\n` +
    `*3️⃣ ᴍᴇᴛᴏᴅᴇ ᴘᴇᴍʙᴀʏᴀʀᴀɴ*\n` +
    `   • *💰 Saldo* - Bayar dengan saldo bot\n` +
    `   • *📱 QRIS* - Bayar dengan QRIS dinamis\n\n` +
    `*4️⃣ ᴘʀᴏꜱᴇꜱ ᴘᴇᴍʙᴀʏᴀʀᴀɴ*\n` +
    `   📱 *QRIS:*\n` +
    `   • Scan QR code yang muncul\n` +
    `   • Nominal otomatis terisi\n` +
    `   • Bayar sesuai nominal\n` +
    `   • Saldo & produk otomatis terkirim!\n\n` +
    `   💰 *Saldo:*\n` +
    `   • Pastikan saldo mencukupi\n` +
    `   • Konfirmasi pembayaran\n` +
    `   • Produk langsung terkirim!\n\n` +
    `*5️⃣ ᴛᴇʀɪᴍᴀ ᴘʀᴏᴅᴜᴋ*\n` +
    `   • Detail produk dikirim via bot\n` +
    `   • Simpan data dengan baik\n\n` +
    `💡 *ᴛɪᴘꜱ:*\n` +
    `• Cek stok sebelum order\n` +
    `• Pastikan nominal QRIS sesuai\n` +
    `• Gunakan /saldo untuk cek saldo\n` +
    `• Hubungi admin jika ada masalah\n\n` +
    `📞 *ʙᴜᴛᴜʜ ʙᴀɴᴛᴜᴀɴ?*\n` +
    `Ketik /help untuk bantuan lengkap`;
  
  await ctx.reply(message, { 
    parse_mode: 'Markdown',
    reply_markup: Markup.keyboard([
      [Markup.button.text('🔙 Kembali ke Menu')],
      [Markup.button.text('💳 Deposit Saldo'), Markup.button.text('👤 Admin')],
      [Markup.button.text('📦 All Stock')]
    ]).resize().reply_markup
  });
});

// Admin contact handler
bot.hears('👤 Admin', async (ctx) => {
  const message = 
    `👤 *ʜᴜʙᴜɴɢɪ ᴀᴅᴍɪɴ*\n\n` +
    `💬 Butuh bantuan? Silakan chat langsung ke admin kami:\n\n` +
    `👉 @pejabatnegeriRi\n\n` +
    `📌 *ʏᴀɴɢ ʙɪꜱᴀ ᴅɪʙᴀɴᴛᴜ:*\n` +
    `• Kendala pembayaran\n` +
    `• Pertanyaan produk\n` +
    `• Refund/komplain\n` +
    `• Saran & masukan\n\n` +
    `⏰ *ᴊᴀᴍ ᴏᴘᴇʀᴀꜱɪᴏɴᴀʟ:*\n` +
    `Senin - Minggu: 08:00 - 22:00 WIB\n\n` +
    `💡 Respon cepat & ramah!`;
  
  await ctx.reply(message, { 
    parse_mode: 'Markdown',
    reply_markup: Markup.keyboard([
      [Markup.button.text('🔙 Kembali ke Menu')],
      [Markup.button.text('💳 Deposit Saldo'), Markup.button.text('📖 Cara Order')]
    ]).resize().reply_markup
  });
});

// All Stock handler
bot.hears('📦 All Stock', async (ctx) => {
  const { getAllProducts } = require('./database/products');
  const { getStockCount } = require('./database/stocks');
  
  const products = getAllProducts();
  
  if (products.length === 0) {
    return ctx.reply(
      '❌ Belum ada produk tersedia.',
      Markup.keyboard([
        [Markup.button.text('🔙 Kembali ke Menu')]
      ]).resize()
    );
  }
  
  let message = `📦 *ᴀʟʟ ꜱᴛᴏᴄᴋ ᴘʀᴏᴅᴜᴋ*\n\n`;
  
  // Group by category
  const { getAllCategories } = require('./database/categories');
  const categories = getAllCategories();
  
  categories.forEach(category => {
    const categoryProducts = products.filter(p => p.categoryName.toLowerCase() === category.name.toLowerCase());
    
    if (categoryProducts.length > 0) {
      message += `📁 *${category.name}*\n`;
      
      categoryProducts.forEach(product => {
        const stockCount = getStockCount(product.code);
        message += `  • ${product.name} (${stockCount})\n`;
      });
      
      message += '\n';
    }
  });
  
  message += `💡 _Total ${products.length} produk_`;
  
  await ctx.reply(message, { 
    parse_mode: 'Markdown',
    reply_markup: Markup.keyboard([
      [Markup.button.text('🔙 Kembali ke Menu')],
      [Markup.button.text('💳 Deposit Saldo'), Markup.button.text('📖 Cara Order')]
    ]).resize().reply_markup
  });
});

// Back to menu keyboard handler
bot.hears('🔙 Kembali ke Menu', async (ctx) => {
  delete depositState[ctx.from.id];
  
  const { getUser } = require('./database/users');
  const user = getUser(ctx.from.id);
  const balance = user ? user.balance : 0;
  
  const now = new Date();
  const wib = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const currentTime = wib.toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit' });
  
  const categories = getAllCategories();
  const maxPerPage = 5;
  const page = 0;
  const startIndex = page * maxPerPage;
  const endIndex = startIndex + maxPerPage;
  const pageCategories = categories.slice(startIndex, endIndex);
  
  const quotes = ["Sukses dimulai dari langkah pertama yang berani.", "Jangan berhenti sampai kamu bangga.", "Kerja keras adalah kunci kesuksesan."];
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
  
  let message = `💰 Saldo: Rp ${balance.toLocaleString('id-ID')}\n🕒 ${currentTime} WIB\n💬 "${randomQuote}"\n\n📦 Kategori Produk:\n`;
  
  if (categories.length > 0) {
    pageCategories.forEach((cat, index) => {
      message += `${startIndex + index + 1}. ${cat.name}\n`;
    });
    
    if (categories.length > maxPerPage) {
      const totalPages = Math.ceil(categories.length / maxPerPage);
      message += `\n📄 Halaman ${page + 1}/${totalPages}`;
    }
    
    const buttons = [];
    for (let i = 0; i < pageCategories.length; i += 2) {
      const row = [];
      const globalIndex = startIndex + i;
      row.push(Markup.button.callback(`${globalIndex + 1}`, `cat_${pageCategories[i].id}`));
      if (pageCategories[i + 1]) {
        row.push(Markup.button.callback(`${globalIndex + 2}`, `cat_${pageCategories[i + 1].id}`));
      }
      buttons.push(row);
    }
    
    if (categories.length > maxPerPage) {
      const navRow = [];
      const totalPages = Math.ceil(categories.length / maxPerPage);
      
      if (page > 0) {
        navRow.push(Markup.button.callback('◀️ Prev', `page_${page - 1}`));
      }
      
      if (page < totalPages - 1) {
        navRow.push(Markup.button.callback('Next ▶️', `page_${page + 1}`));
      }
      
      if (navRow.length > 0) {
        buttons.push(navRow);
      }
    }
    
    delete require.cache[require.resolve('./config/config')];
    const currentPhotoUrl = require('./config/config').photoUrl;
    
    await ctx.replyWithPhoto(currentPhotoUrl, {
      caption: message,
      reply_markup: {
        inline_keyboard: buttons
      }
    });
    
    await ctx.reply('💳 Gunakan keyboard di bawah untuk deposit:', 
      Markup.keyboard([
        [Markup.button.text('💳 Deposit Saldo'), Markup.button.text('📦 All Stock')],
        [Markup.button.text('📖 Cara Order'), Markup.button.text('👤 Admin')]
      ]).resize()
    );
  }
});

bot.on('text', async (ctx, next) => {
  // Handle deposit amount
  if (depositState[ctx.from.id]?.waitingAmount) {
    const amount = parseInt(ctx.message.text);
    
    if (isNaN(amount) || amount < 1000) {
      return ctx.reply('❌ Jumlah deposit minimal Rp 1.000 dan harus berupa angka!');
    }
    
    delete depositState[ctx.from.id];
    
    // Generate QRIS for deposit
    const uniqueCode = Math.floor(Math.random() * 900) + 100;
    const totalWithCode = amount + uniqueCode;
    
    try {
      const depositId = `DEPOSIT-${ctx.from.id}-${Date.now()}`;
      
      // Generate dynamic QRIS with exact amount
      const qrBuffer = await generateDynamicQRIS(totalWithCode, depositId);
      
      const sentMessage = await ctx.replyWithPhoto(
        { source: qrBuffer },
        {
          caption: 
            `💳 *ᴅᴇᴘᴏꜱɪᴛ ꜱᴀʟᴅᴏ*\n\n` +
            `💰 ᴊᴜᴍʟᴀʜ: Rp ${amount.toLocaleString('id-ID')}\n` +
            `🔢 ᴋᴏᴅᴇ ᴜɴɪᴋ: +Rp ${uniqueCode}\n` +
            `💳 *ᴛᴏᴛᴀʟ ʙᴀʏᴀʀ: Rp ${totalWithCode.toLocaleString('id-ID')}*\n\n` +
            `✨ QRIS ᴅɪɴᴀᴍɪꜱ - ɴᴏᴍɪɴᴀʟ ᴏᴛᴏᴍᴀᴛɪꜱ ᴛᴇʀɪꜱɪ!\n` +
            `⏰ ᴍᴇɴᴜɴɢɢᴜ ᴘᴇᴍʙᴀʏᴀʀᴀɴ...\n\n` +
            `_Scan QR code di atas untuk bayar_`,
          parse_mode: 'Markdown',
          reply_markup: Markup.keyboard([
            [Markup.button.text('🔙 Kembali ke Menu')],
            [Markup.button.text('📖 Cara Order'), Markup.button.text('👤 Admin')],
            [Markup.button.text('📦 All Stock')]
          ]).resize().reply_markup
        }
      );
      
      const depositData = {
        userId: ctx.from.id,
        type: 'deposit', // Mark as deposit
        amount: amount,
        uniqueCode: uniqueCode,
        total: totalWithCode,
        createdAt: new Date().toISOString(),
        messageToDelete: sentMessage.message_id
      };
      
      qrisAPI.addPendingPayment(depositId, depositData);
      
      console.log(`💳 Deposit Payment created: ${depositId}`);
      console.log(`   User: ${ctx.from.id}`);
      console.log(`   Amount: Rp ${amount.toLocaleString('id-ID')}`);
      console.log(`   Total: Rp ${totalWithCode.toLocaleString('id-ID')}`);
      
    } catch (error) {
      console.error('Error generating deposit QRIS:', error);
      await ctx.reply(
        `❌ *ɢᴀɢᴀʟ ɢᴇɴᴇʀᴀᴛᴇ QRIS*\n\n⚠️ ${error.message}\n\nSilakan coba lagi atau hubungi admin.`,
        { parse_mode: 'Markdown' }
      );
    }
    
    return;
  }
  
  // Handle edit qty
  if (editQtyState[ctx.from.id]) {
    const qty = parseInt(ctx.message.text);
    if (isNaN(qty) || qty < 1) return ctx.reply('❌ Jumlah harus berupa angka positif!');
    
    const { productId } = editQtyState[ctx.from.id];
    delete editQtyState[ctx.from.id];
    await showProductMessage(ctx, productId, qty, false);
    return;
  }
  return next();
});

bot.action(/^cat_back_(.+)$/, async (ctx) => {
  const categoryName = decodeURIComponent(ctx.match[1]);
  const categories = getAllCategories();
  const category = categories.find(cat => cat.name.toLowerCase().trim() === categoryName.toLowerCase().trim());
  
  if (category) {
    const products = getProductsByCategory(category.name);
    await ctx.answerCbQuery();
    
    if (products.length > 0) {
      let message = `📦 Kategori: ${category.name}\n\n`;
      products.forEach((prod, idx) => {
        const stock = prod.code ? getStockCount(prod.code) : 0;
        message += `${idx + 1}. ${prod.name}\n`;
        message += `   💰 Harga: Rp ${prod.price.toLocaleString('id-ID')}\n`;
        message += `   📊 Stok: ${stock}\n`;
        message += `   📝 ${prod.detail}\n\n`;
      });
      
      const buttons = [];
      for (let i = 0; i < products.length; i += 2) {
        const row = [];
        row.push(Markup.button.callback(`${i + 1}`, `prod_${products[i].id}`));
        if (products[i + 1]) {
          row.push(Markup.button.callback(`${i + 2}`, `prod_${products[i + 1].id}`));
        }
        buttons.push(row);
      }
      buttons.push([Markup.button.callback('🔙 Kembali', 'back_home')]);
      
      await safeEditMessage(ctx, message, Markup.inlineKeyboard(buttons));
    } else {
      await safeEditMessage(ctx, `📦 Kategori: ${category.name}\n\n❌ Belum ada produk.`, 
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', 'back_home')]]));
    }
  } else {
    await ctx.answerCbQuery('Kategori tidak ditemukan');
  }
});

bot.action('back_home', async (ctx) => {
  await ctx.answerCbQuery();
  
  const quotes = ["Sukses dimulai dari langkah pertama yang berani.", "Jangan berhenti sampai kamu bangga.", "Kerja keras adalah kunci kesuksesan.", "Mimpi besar dimulai dari tindakan kecil.", "Tetap semangat dan pantang menyerah!"];
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
  const now = new Date();
  const wib = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const currentTime = wib.toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit' });
  
  const { getUser } = require('./database/users');
  const user = getUser(ctx.from.id);
  const balance = user ? user.balance : 0;
  const categories = getAllCategories();
  
  const maxPerPage = 5;
  const page = 0; // Back to first page
  const startIndex = page * maxPerPage;
  const endIndex = startIndex + maxPerPage;
  const pageCategories = categories.slice(startIndex, endIndex);
  
  let message = `💰 Saldo: Rp ${balance.toLocaleString('id-ID')}\n🕒 ${currentTime} WIB\n💬 "${randomQuote}"\n\n📦 Kategori Produk:\n`;
  
  if (categories.length > 0) {
    pageCategories.forEach((cat, index) => {
      message += `${startIndex + index + 1}. ${cat.name}\n`;
    });
    
    if (categories.length > maxPerPage) {
      const totalPages = Math.ceil(categories.length / maxPerPage);
      message += `\n📄 Halaman ${page + 1}/${totalPages}`;
    }
    
    // Build buttons with pagination
    const buttons = [];
    for (let i = 0; i < pageCategories.length; i += 2) {
      const row = [];
      const globalIndex = startIndex + i;
      row.push(Markup.button.callback(`${globalIndex + 1}`, `cat_${pageCategories[i].id}`));
      if (pageCategories[i + 1]) {
        row.push(Markup.button.callback(`${globalIndex + 2}`, `cat_${pageCategories[i + 1].id}`));
      }
      buttons.push(row);
    }
    
    // Add pagination navigation
    if (categories.length > maxPerPage) {
      const navRow = [];
      const totalPages = Math.ceil(categories.length / maxPerPage);
      
      if (page > 0) {
        navRow.push(Markup.button.callback('◀️ Prev', `page_${page - 1}`));
      }
      
      if (page < totalPages - 1) {
        navRow.push(Markup.button.callback('Next ▶️', `page_${page + 1}`));
      }
      
      if (navRow.length > 0) {
        buttons.push(navRow);
      }
    }
    
    await safeEditMessage(ctx, message, Markup.inlineKeyboard(buttons));
  } else {
    message += '\n❌ Belum ada kategori.';
    await safeEditMessage(ctx, message);
  }
});

// Pagination navigation handler
bot.action(/^page_(\d+)$/, async (ctx) => {
  const page = parseInt(ctx.match[1]);
  await ctx.answerCbQuery();
  
  const quotes = ["Sukses dimulai dari langkah pertama yang berani.", "Jangan berhenti sampai kamu bangga.", "Kerja keras adalah kunci kesuksesan.", "Mimpi besar dimulai dari tindakan kecil.", "Tetap semangat dan pantang menyerah!"];
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
  const now = new Date();
  const wib = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  const currentTime = wib.toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit' });
  
  const { getUser } = require('./database/users');
  const user = getUser(ctx.from.id);
  const balance = user ? user.balance : 0;
  const categories = getAllCategories();
  
  const maxPerPage = 5;
  const startIndex = page * maxPerPage;
  const endIndex = startIndex + maxPerPage;
  const pageCategories = categories.slice(startIndex, endIndex);
  
  let message = `💰 Saldo: Rp ${balance.toLocaleString('id-ID')}\n🕒 ${currentTime} WIB\n💬 "${randomQuote}"\n\n📦 Kategori Produk:\n`;
  
  if (categories.length > 0) {
    pageCategories.forEach((cat, index) => {
      message += `${startIndex + index + 1}. ${cat.name}\n`;
    });
    
    const totalPages = Math.ceil(categories.length / maxPerPage);
    message += `\n📄 Halaman ${page + 1}/${totalPages}`;
    
    // Build buttons with pagination
    const buttons = [];
    for (let i = 0; i < pageCategories.length; i += 2) {
      const row = [];
      const globalIndex = startIndex + i;
      row.push(Markup.button.callback(`${globalIndex + 1}`, `cat_${pageCategories[i].id}`));
      if (pageCategories[i + 1]) {
        row.push(Markup.button.callback(`${globalIndex + 2}`, `cat_${pageCategories[i + 1].id}`));
      }
      buttons.push(row);
    }
    
    // Add pagination navigation
    const navRow = [];
    
    if (page > 0) {
      navRow.push(Markup.button.callback('◀️ Prev', `page_${page - 1}`));
    }
    
    if (page < totalPages - 1) {
      navRow.push(Markup.button.callback('Next ▶️', `page_${page + 1}`));
    }
    
    if (navRow.length > 0) {
      buttons.push(navRow);
    }
    
    await safeEditMessage(ctx, message, Markup.inlineKeyboard(buttons));
  }
});

// Dummy handler for page info button
bot.action('page_info', async (ctx) => {
  await ctx.answerCbQuery('Info halaman');
});

bot.action(/^pay_saldo_(.+)_(\d+)$/, async (ctx) => {
  const productId = parseFloat(ctx.match[1]);
  const qty = parseInt(ctx.match[2]);
  await ctx.answerCbQuery();
  const product = findProduct(productId);
  
  if (product) {
    const stockCount = product.code ? getStockCount(product.code) : 0;
    
    if (stockCount < qty) {
      return await safeEditMessage(
        ctx,
        `❌ Stok tidak cukup!\n\n📦 ${product.name}\n📊 Stok tersedia: ${stockCount}\n📦 Jumlah diminta: ${qty}\n\nMaaf, stok tidak mencukupi.`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', `prod_${product.id}_${qty}`)]])
      );
    }
    
    const { getUser, updateBalance } = require('./database/users');
    const user = getUser(ctx.from.id);
    const total = product.price * qty;
    
    if (!user || user.balance < total) {
      return await safeEditMessage(
        ctx,
        `❌ Saldo tidak cukup!\n\n💰 Saldo Anda: Rp ${user ? user.balance.toLocaleString('id-ID') : 0}\n💵 Total: Rp ${total.toLocaleString('id-ID')}\n\nSilakan isi saldo terlebih dahulu.`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', `prod_${product.id}_${qty}`)]]) 
      );
    }
    
    const stocks = useStock(product.code, qty);
    
    if (!stocks) {
      return await safeEditMessage(
        ctx,
        `❌ Gagal mengambil stok!\n\nSilakan hubungi admin.`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', `prod_${product.id}_${qty}`)]]) 
      );
    }
    
    updateBalance(ctx.from.id, -total);
    
    let accountDetails = '';
    stocks.forEach((stock, index) => {
      accountDetails += `\n${index + 1}. ${stock.detail}`;
    });
    
    await safeEditMessage(
      ctx,
      `✅ Pembelian Berhasil!\n\n📦 ${product.name}\n📦 Jumlah: ${qty}\n💰 Total: Rp ${total.toLocaleString('id-ID')}\n\n💵 Saldo tersisa: Rp ${(user.balance - total).toLocaleString('id-ID')}\n\nTerima kasih!`,
      Markup.inlineKeyboard([[Markup.button.callback('🏠 Menu Utama', 'back_home')]])
    );
    
    await ctx.reply(`🎉 Detail Akun:\n${accountDetails}\n\n⚠️ Simpan data ini dengan baik!`);
  }
});

bot.action(/^pay_qris_(.+)_(\d+)$/, async (ctx) => {
  const productId = parseFloat(ctx.match[1]);
  const qty = parseInt(ctx.match[2]);
  await ctx.answerCbQuery();
  const product = findProduct(productId);
  
  if (product) {
    const stockCount = product.code ? getStockCount(product.code) : 0;
    
    if (stockCount < qty) {
      return await safeEditMessage(
        ctx,
        `❌ Stok tidak cukup!\n\n📦 ${product.name}\n📊 Stok tersedia: ${stockCount}\n📦 Jumlah diminta: ${qty}\n\nMaaf, stok tidak mencukupi.`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', `prod_${product.id}_${qty}`)]])
      );
    }
    
    const total = product.price * qty;
    const uniqueCode = Math.floor(Math.random() * 900) + 100;
    const totalWithCode = total + uniqueCode;
    
    try {
      const paymentId = `QRIS-${ctx.from.id}-${Date.now()}`;
      
      // Generate dynamic QRIS with exact amount
      const qrBuffer = await generateDynamicQRIS(totalWithCode, paymentId);
      
      await ctx.deleteMessage();
      const sentMessage = await ctx.replyWithPhoto(
        { source: qrBuffer },
        {
          caption: `📱 *ᴘᴇᴍʙᴀʏᴀʀᴀɴ QRIS*\n\n📦 ᴘʀᴏᴅᴜᴋ: ${product.name}\n📦 ᴊᴜᴍʟᴀʜ: ${qty}\n💰 ꜱᴜʙᴛᴏᴛᴀʟ: Rp ${total.toLocaleString('id-ID')}\n🔢 ᴋᴏᴅᴇ ᴜɴɪᴋ: +Rp ${uniqueCode}\n� *ᴛᴏᴛᴀʟ ʙᴀʏᴀʀ: Rp ${totalWithCode.toLocaleString('id-ID')}*\n\n✨ QRIS ᴅɪɴᴀᴍɪꜱ - ɴᴏᴍɪɴᴀʟ ᴏᴛᴏᴍᴀᴛɪꜱ ᴛᴇʀɪꜱɪ!\n⏰ ᴍᴇɴᴜɴɢɢᴜ ᴘᴇᴍʙᴀʏᴀʀᴀɴ...\n\n_Scan QR code di atas untuk bayar_`,
          parse_mode: 'Markdown',
          ...Markup.inlineKeyboard([[Markup.button.callback('❌ Batal', 'back_home')]])
        }
      );
      
      const paymentData = {
        userId: ctx.from.id,
        productId: product.id,
        productName: product.name,
        productCode: product.code,
        quantity: qty,
        subtotal: total,
        uniqueCode: uniqueCode,
        total: totalWithCode,
        createdAt: new Date().toISOString(),
        messageToDelete: sentMessage.message_id
      };
      
      qrisAPI.addPendingPayment(paymentId, paymentData);
      
      console.log(`💳 QRIS Payment created: ${paymentId}`);
      console.log(`   Product: ${product.name} (Code: ${product.code})`);
      console.log(`   Quantity: ${qty}`);
      console.log(`   Total: Rp ${totalWithCode.toLocaleString('id-ID')}`);
      
    } catch (error) {
      console.error('Error generating dynamic QRIS:', error);
      await safeEditMessage(
        ctx,
        `❌ *ɢᴀɢᴀʟ ɢᴇɴᴇʀᴀᴛᴇ QRIS*\n\n⚠️ ${error.message}\n\nSilakan coba lagi atau hubungi admin.`,
        Markup.inlineKeyboard([[Markup.button.callback('🔙 Kembali', `prod_${product.id}_${qty}`)]])
      );
    }
  }
});

bot.command('help', (ctx) => {
  const { adminId } = require('./config/config');
  const isAdmin = ctx.from.id === adminId;
  
  let helpMessage = '📋 *ᴅᴀꜰᴛᴀʀ ᴘᴇʀɪɴᴛᴀʜ*\n\n';
  
  // User Commands
  helpMessage += '👤 *ᴜꜱᴇʀ ᴄᴏᴍᴍᴀɴᴅꜱ:*\n';
  helpMessage += '`/start` - Mulai bot\n';
  helpMessage += '`/saldo` - Cek saldo\n';
  helpMessage += '`/help` - Bantuan\n\n';
  
  // Admin Commands (only show to admin)
  if (isAdmin) {
    helpMessage += '👑 *ᴀᴅᴍɪɴ ᴄᴏᴍᴍᴀɴᴅꜱ:*\n\n';
    
    helpMessage += '📦 *ᴘʀᴏᴅᴜᴋ & ꜱᴛᴏᴋ:*\n';
    helpMessage += '`/addcategory` `<nama1,nama2,...>`\n';
    helpMessage += '  ↳ Tambah kategori (support multiple)\n';
    helpMessage += '`/delcategory` `<nama1,nama2,...>`\n';
    helpMessage += '  ↳ Hapus kategori (support multiple)\n';
    helpMessage += '`/listcategory`\n';
    helpMessage += '  ↳ List semua kategori\n';
    helpMessage += '`/addproduk` `kategori,code,nama,harga,detail`\n';
    helpMessage += '  ↳ Tambah produk\n';
    helpMessage += '`/listproduk`\n';
    helpMessage += '  ↳ List semua produk\n';
    helpMessage += '`/addstok` `code,detail1,detail2,...`\n';
    helpMessage += '  ↳ Tambah stok produk\n';
    helpMessage += '`/delstok` `code nomor1,nomor2`\n';
    helpMessage += '  ↳ Hapus stok berdasarkan nomor\n';
    helpMessage += '`/cekstok` `<code>`\n';
    helpMessage += '  ↳ Cek detail stok produk\n\n';
    
    helpMessage += '📢 *ᴋᴏᴍᴜɴɪᴋᴀꜱɪ:*\n';
    helpMessage += '`/broadcast` `<pesan>`\n';
    helpMessage += '  ↳ Kirim pesan ke semua user\n\n';
    
    helpMessage += '⚙️ *ꜱᴇᴛᴛɪɴɢꜱ:*\n';
    helpMessage += '`/gantifoto` `<url>`\n';
    helpMessage += '  ↳ Ganti foto di pesan bot\n\n';
    
    helpMessage += '💡 *ᴛɪᴘꜱ:*\n';
    helpMessage += 'Gunakan `/help` untuk melihat panduan lengkap\n';
  }
  
  ctx.reply(helpMessage, { parse_mode: 'Markdown' });
});

qrisAPI.setupEndpoint(app, bot);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Express server running on port ${PORT}`);
  console.log(`📡 Webhook endpoint: http://localhost:${PORT}/api/qris-callback`);
});

bot.launch();

console.log('🤖 Bot berhasil dijalankan!');

process.once('SIGINT', () => {
  bot.stop('SIGINT');
  process.exit(0);
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  process.exit(0);
});
