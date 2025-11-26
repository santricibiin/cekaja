const { addStock, getStockCount } = require('../../database/stocks');
const { getProductByCode } = require('../../database/products');

const addStokHandler = async (ctx) => {
  const input = ctx.message.text.replace('/addstok', '').trim();
  
  if (!input) {
    return ctx.reply('❌ Format: /addstok codeproduk,detail1,detail2,...\n\nContoh:\n/addstok CP001,email1@x.com|pass123,email2@x.com|pass456');
  }
  
  const parts = input.split(',').map(p => p.trim());
  
  if (parts.length < 2) {
    return ctx.reply('❌ Minimal: /addstok codeproduk,detail');
  }
  
  const code = parts[0];
  const details = parts.slice(1);
  
  const product = getProductByCode(code);
  
  if (!product) {
    return ctx.reply(`❌ Produk dengan code "${code}" tidak ditemukan!`);
  }
  
  let addedCount = 0;
  details.forEach((detail) => {
    if (detail && detail.trim() !== '') {
      addStock(code, detail);
      addedCount++;
    }
  });
  
  const stockCount = getStockCount(code);
  
  ctx.reply(`✅ Berhasil menambahkan ${addedCount} stok!\n\n📦 ${product.name}\n🔖 Code: ${code}\n📊 Total Stok: ${stockCount}`);
};

module.exports = addStokHandler;
