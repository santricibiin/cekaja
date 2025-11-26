const { addCategory } = require('../../database/categories');

const addCategoryHandler = async (ctx) => {
  const input = ctx.message.text.replace('/addcategory', '').trim();
  
  if (!input) {
    return ctx.reply(
      '❌ Format: /addcategory <nama kategori>\n\n' +
      'Contoh:\n' +
      '/addcategory Elektronik\n' +
      '/addcategory Gaming,Streaming,Software'
    );
  }
  
  // Split by comma for multiple categories
  const categoryNames = input.split(',').map(name => name.trim()).filter(name => name);
  
  if (categoryNames.length === 0) {
    return ctx.reply('❌ Tidak ada kategori yang valid!');
  }
  
  const results = {
    success: [],
    failed: []
  };
  
  categoryNames.forEach(categoryName => {
    const category = addCategory(categoryName);
    
    if (category) {
      results.success.push(categoryName);
    } else {
      results.failed.push(categoryName);
    }
  });
  
  let message = '';
  
  if (results.success.length > 0) {
    message += `✅ *ʙᴇʀʜᴀꜱɪʟ ᴅɪᴛᴀᴍʙᴀʜᴋᴀɴ:*\n`;
    results.success.forEach(name => {
      message += `  • ${name}\n`;
    });
  }
  
  if (results.failed.length > 0) {
    if (message) message += '\n';
    message += `❌ *ɢᴀɢᴀʟ (ꜱᴜᴅᴀʜ ᴀᴅᴀ):*\n`;
    results.failed.forEach(name => {
      message += `  • ${name}\n`;
    });
  }
  
  ctx.reply(message, { parse_mode: 'Markdown' });
};

module.exports = addCategoryHandler;
