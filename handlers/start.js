const { adminId } = require('../config/config');
const { createUser } = require('../database/users');
const { getAllCategories } = require('../database/categories');
const { Markup } = require('telegraf');

// Helper function to get current photo URL (supports runtime changes)
const getPhotoUrl = () => {
  delete require.cache[require.resolve('../config/config')];
  return require('../config/config').photoUrl;
};

const quotes = [
  "Sukses dimulai dari langkah pertama yang berani.",
  "Jangan berhenti sampai kamu bangga.",
  "Kerja keras adalah kunci kesuksesan.",
  "Mimpi besar dimulai dari tindakan kecil.",
  "Tetap semangat dan pantang menyerah!",
  "Hari ini adalah kesempatan baru untuk menjadi lebih baik.",
  "Percaya pada diri sendiri adalah awal dari segalanya.",
  "Kesuksesan adalah hasil dari konsistensi.",
  "Setiap usaha tidak akan mengkhianati hasil.",
  "Jadilah versi terbaik dari dirimu sendiri."
];

const getWIBTime = () => {
  const now = new Date();
  const wib = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Jakarta' }));
  return wib.toLocaleString('id-ID', { hour: '2-digit', minute: '2-digit' });
};

const startHandler = async (ctx) => {
  const userId = ctx.from.id;
  const username = ctx.from.username || ctx.from.first_name;
  const isAdmin = userId === adminId;
  
  createUser(userId, username);
  
  const randomQuote = quotes[Math.floor(Math.random() * quotes.length)];
  const currentTime = getWIBTime();
  
  let message = `👋 Selamat datang, ${ctx.from.first_name}!\n\n`;
  message += `🕐 ${currentTime} WIB\n`;
  message += `💬 "${randomQuote}"\n\n`;
  
  if (isAdmin) {
    message += `👑 *ᴍᴇɴᴜ ᴀᴅᴍɪɴ*\n\n`;
    message += `📦 *ᴘʀᴏᴅᴜᴋ & ꜱᴛᴏᴋ:*\n`;
    message += `/addcategory <nama1,nama2,...>\n`;
    message += `/delcategory <nama1,nama2,...>\n`;
    message += `/listcategory - List semua kategori\n`;
    message += `/addproduk kategori,code,nama,harga,detail\n`;
    message += `/listproduk - List semua produk\n`;
    message += `/addstok code,detail1,detail2,...\n`;
    message += `/delstok code nomor1,nomor2\n`;
    message += `/cekstok <code> - Cek stok produk\n\n`;
    message += `📢 *ᴋᴏᴍᴜɴɪᴋᴀꜱɪ:*\n`;
    message += `/broadcast <pesan>\n\n`;
    message += `⚙️ *ꜱᴇᴛᴛɪɴɢꜱ:*\n`;
    message += `/gantifoto <url>\n\n`;
    message += `ℹ️ *ʟᴀɪɴɴʏᴀ:*\n`;
    message += `/saldo - Cek saldo\n`;
    message += `/help - Bantuan lengkap`;
    await ctx.replyWithPhoto(getPhotoUrl(), { caption: message, parse_mode: 'Markdown' });
  } else {
    const { getUser } = require('../database/users');
    const user = getUser(ctx.from.id);
    const balance = user ? user.balance : 0;
    const categories = getAllCategories();
    
    const maxPerPage = 5;
    const page = 0; // Default to first page
    const startIndex = page * maxPerPage;
    const endIndex = startIndex + maxPerPage;
    const pageCategories = categories.slice(startIndex, endIndex);
    
    message = `💰 Saldo: Rp ${balance.toLocaleString('id-ID')}\n🕒 ${currentTime} WIB\n💬 "${randomQuote}"\n\n📦 Kategori Produk:\n`;
    
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
      
      await ctx.replyWithPhoto(getPhotoUrl(), {
        caption: message,
        reply_markup: {
          inline_keyboard: buttons,
          resize_keyboard: true
        }
      });
      
      // Send keyboard with deposit and cara order buttons
      await ctx.reply('💳 Gunakan keyboard di bawah untuk deposit:', 
        Markup.keyboard([
          [Markup.button.text('💳 Deposit Saldo'), Markup.button.text('📦 All Stock')],
          [Markup.button.text('📖 Cara Order'), Markup.button.text('👤 Admin')]
        ]).resize()
      );
    } else {
      message += `\n❌ Belum ada kategori.`;
      await ctx.replyWithPhoto(getPhotoUrl(), { caption: message });
    }
  }
};

module.exports = startHandler;
