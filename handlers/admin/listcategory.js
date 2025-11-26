const { getAllCategories } = require('../../database/categories');

const listCategoryHandler = async (ctx) => {
  const categories = getAllCategories();
  
  if (categories.length === 0) {
    return ctx.reply('❌ Belum ada kategori.');
  }
  
  let message = `📁 *ᴅᴀꜰᴛᴀʀ ᴋᴀᴛᴇɢᴏʀɪ*\n\n`;
  message += `Total: ${categories.length} kategori\n\n`;
  
  categories.forEach((category, index) => {
    message += `${index + 1}. ${category.name}\n`;
    message += `   🆔 ID: \`${category.id}\`\n`;
    message += `   📅 ${new Date(category.createdAt).toLocaleDateString('id-ID')}\n\n`;
  });
  
  ctx.reply(message, { parse_mode: 'Markdown' });
};

module.exports = listCategoryHandler;
