const { getProductByCode } = require('../../database/products');
const { getStocksByCode } = require('../../database/stocks');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, '../../database/stocks.json');

const readDB = () => {
  const data = fs.readFileSync(dbPath, 'utf8');
  return JSON.parse(data);
};

const writeDB = (data) => {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
};

const delStokHandler = async (ctx) => {
  const input = ctx.message.text.replace('/delstok', '').trim();
  
  if (!input) {
    return ctx.reply(
      '❌ Format: /delstok <code> <nomor1,nomor2,...>\n\n' +
      'Contoh:\n' +
      '/delstok STEAM50K 1\n' +
      '/delstok NETFLX 1,3,5'
    );
  }
  
  const parts = input.split(' ');
  
  if (parts.length < 2) {
    return ctx.reply('❌ Format salah! Gunakan: /delstok <code> <nomor1,nomor2,...>');
  }
  
  const productCode = parts[0];
  const stockNumbers = parts[1].split(',').map(num => parseInt(num.trim())).filter(num => !isNaN(num));
  
  if (stockNumbers.length === 0) {
    return ctx.reply('❌ Nomor stok tidak valid!');
  }
  
  const product = getProductByCode(productCode);
  
  if (!product) {
    return ctx.reply(`❌ Produk dengan code "${productCode}" tidak ditemukan!`);
  }
  
  const stocks = getStocksByCode(productCode);
  
  if (stocks.length === 0) {
    return ctx.reply(`❌ Tidak ada stok available untuk produk "${product.name}"!`);
  }
  
  // Validate stock numbers
  const invalidNumbers = stockNumbers.filter(num => num < 1 || num > stocks.length);
  
  if (invalidNumbers.length > 0) {
    return ctx.reply(
      `❌ Nomor stok invalid: ${invalidNumbers.join(', ')}\n\n` +
      `Stok available: 1-${stocks.length}`
    );
  }
  
  // Get stock IDs to delete
  const stocksToDelete = [];
  stockNumbers.forEach(num => {
    const stock = stocks[num - 1]; // Convert to 0-indexed
    stocksToDelete.push(stock);
  });
  
  // Delete stocks
  const db = readDB();
  let deletedCount = 0;
  
  stocksToDelete.forEach(stockToDelete => {
    const index = db.stocks.findIndex(s => 
      s.productCode.toLowerCase() === productCode.toLowerCase() && 
      s.detail === stockToDelete.detail &&
      s.status === 'available'
    );
    
    if (index !== -1) {
      db.stocks.splice(index, 1);
      deletedCount++;
    }
  });
  
  writeDB(db);
  
  const remainingStocks = getStocksByCode(productCode);
  
  let message = `✅ *ʙᴇʀʜᴀꜱɪʟ ᴍᴇɴɢʜᴀᴘᴜꜱ ꜱᴛᴏᴋ*\n\n`;
  message += `📦 Produk: ${product.name}\n`;
  message += `🔖 Code: \`${productCode}\`\n`;
  message += `🗑️  Dihapus: ${deletedCount} stok\n`;
  message += `📊 Sisa: ${remainingStocks.length} stok\n\n`;
  
  if (deletedCount > 0) {
    message += `*ꜱᴛᴏᴋ ʏᴀɴɢ ᴅɪʜᴀᴘᴜꜱ:*\n`;
    stocksToDelete.forEach((stock, index) => {
      message += `${stockNumbers[index]}. \`${stock.detail}\`\n`;
    });
  }
  
  ctx.reply(message, { parse_mode: 'Markdown' });
};

module.exports = delStokHandler;
