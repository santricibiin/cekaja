const { deleteCategoryByName } = require('../../database/categories');

const delCategoryHandler = async (ctx) => {
  const input = ctx.message.text.replace('/delcategory', '').trim();
  
  if (!input) {
    return ctx.reply(
      '❌ Format: /delcategory <nama kategori>\n\n' +
      'Contoh:\n' +
      '/delcategory Elektronik\n' +
      '/delcategory Gaming,Streaming,Software'
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
    const deleted = deleteCategoryByName(categoryName);
    
    if (deleted) {
      results.success.push(categoryName);
    } else {
      results.failed.push(categoryName);
    }
  });
  
  let message = '';
  
  if (results.success.length > 0) {
    message += `✅ *ʙᴇʀʜᴀꜱɪʟ ᴅɪʜᴀᴘᴜꜱ:*\n`;
    results.success.forEach(name => {
      message += `  • ${name}\n`;
    });
  }
  
  if (results.failed.length > 0) {
    if (message) message += '\n';
    message += `❌ *ɢᴀɢᴀʟ (ᴛɪᴅᴀᴋ ᴅɪᴛᴇᴍᴜᴋᴀɴ):*\n`;
    results.failed.forEach(name => {
      message += `  • ${name}\n`;
    });
  }
  
  ctx.reply(message, { parse_mode: 'Markdown' });
};

module.exports = delCategoryHandler;
