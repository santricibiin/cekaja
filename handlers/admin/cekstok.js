const { getProductByCode } = require('../../database/products');
const { getStocksByCode, getStockCount } = require('../../database/stocks');

const cekStokHandler = async (ctx) => {
  const productCode = ctx.message.text.replace('/cekstok', '').trim();
  
  if (!productCode) {
    return ctx.reply(
      '❌ Format: /cekstok <code produk>\n\n' +
      'Contoh:\n' +
      '/cekstok GAME001'
    );
  }
  
  const product = getProductByCode(productCode);
  
  if (!product) {
    return ctx.reply(`❌ Produk dengan code "${productCode}" tidak ditemukan!`);
  }
  
  const stocks = getStocksByCode(productCode);
  const stockCount = getStockCount(productCode);
  
  let message = `📊 *ᴄᴇᴋ ꜱᴛᴏᴋ*\n\n`;
  message += `📦 *ᴘʀᴏᴅᴜᴋ:*\n`;
  message += `  • Nama: ${product.name}\n`;
  message += `  • Code: \`${product.code}\`\n`;
  message += `  • Kategori: ${product.categoryName}\n`;
  message += `  • Harga: Rp ${product.price.toLocaleString('id-ID')}\n\n`;
  
  message += `📈 *ꜱᴛᴀᴛᴜꜱ ꜱᴛᴏᴋ:*\n`;
  message += `  • Available: ${stockCount}\n`;
  message += `  • Total: ${stocks.length}\n\n`;
  
  if (stockCount > 0) {
    message += `✅ *ᴅᴇᴛᴀɪʟ ꜱᴛᴏᴋ ᴀᴠᴀɪʟᴀʙʟᴇ:*\n\n`;
    
    stocks.slice(0, 10).forEach((stock, index) => {
      message += `${index + 1}. \`${stock.detail}\`\n`;
    });
    
    if (stocks.length > 10) {
      message += `\n...dan ${stocks.length - 10} stok lainnya`;
    }
  } else {
    message += `❌ Stok habis!`;
  }
  
  ctx.reply(message, { parse_mode: 'Markdown' });
};

module.exports = cekStokHandler;
