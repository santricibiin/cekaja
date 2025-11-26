const { getAllProducts } = require('../../database/products');
const { getStockCount } = require('../../database/stocks');

const listProdukHandler = async (ctx) => {
  const products = getAllProducts();
  
  if (products.length === 0) {
    return ctx.reply('❌ Belum ada produk.');
  }
  
  let message = `📦 *ᴅᴀꜰᴛᴀʀ ᴘʀᴏᴅᴜᴋ*\n\n`;
  message += `Total: ${products.length} produk\n\n`;
  
  // Group by category
  const categorized = {};
  products.forEach(product => {
    if (!categorized[product.categoryName]) {
      categorized[product.categoryName] = [];
    }
    categorized[product.categoryName].push(product);
  });
  
  Object.keys(categorized).forEach(categoryName => {
    message += `📁 *${categoryName}*\n`;
    
    categorized[categoryName].forEach((product, index) => {
      const stockCount = getStockCount(product.code);
      message += `  ${index + 1}. ${product.name}\n`;
      message += `     💰 Rp ${product.price.toLocaleString('id-ID')}\n`;
      message += `     🔖 Code: \`${product.code}\`\n`;
      message += `     📊 Stok: ${stockCount}\n`;
    });
    
    message += '\n';
  });
  
  ctx.reply(message, { parse_mode: 'Markdown' });
};

module.exports = listProdukHandler;
