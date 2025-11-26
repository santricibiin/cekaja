const fs = require('fs');
const path = require('path');

const changePhotoHandler = async (ctx) => {
  const input = ctx.message.text.replace('/gantifoto', '').trim();
  
  if (!input) {
    return ctx.reply(
      '❌ Format: /gantifoto <URL>\n\n' +
      'Contoh:\n' +
      '/gantifoto https://example.com/photo.jpg\n\n' +
      '📝 URL harus valid (http/https)'
    );
  }
  
  // Validate URL
  const urlPattern = /^https?:\/\/.+/i;
  if (!urlPattern.test(input)) {
    return ctx.reply('❌ URL tidak valid! Harus dimulai dengan http:// atau https://');
  }
  
  try {
    // Path to .env file
    const envPath = path.join(__dirname, '../../.env');
    
    // Read .env file
    let envContent = '';
    if (fs.existsSync(envPath)) {
      envContent = fs.readFileSync(envPath, 'utf8');
    }
    
    // Update or add PHOTO_URL
    const photoUrlRegex = /^PHOTO_URL=.*/m;
    if (photoUrlRegex.test(envContent)) {
      // Update existing
      envContent = envContent.replace(photoUrlRegex, `PHOTO_URL=${input}`);
    } else {
      // Add new line
      envContent += `\nPHOTO_URL=${input}`;
    }
    
    // Save to .env
    fs.writeFileSync(envPath, envContent.trim() + '\n', 'utf8');
    
    // Update runtime config
    process.env.PHOTO_URL = input;
    require('../../config/config').photoUrl = input;
    
    ctx.reply(
      `✅ *ꜰᴏᴛᴏ ʙᴇʀʜᴀꜱɪʟ ᴅɪɢᴀɴᴛɪ!*\n\n` +
      `🖼️ URL Baru:\n\`${input}\`\n\n` +
      `📅 Updated: ${new Date().toLocaleString('id-ID')}\n\n` +
      `⚠️ Foto baru langsung berlaku!`,
      { parse_mode: 'Markdown' }
    );
    
    console.log(`📸 Photo URL changed by admin ${ctx.from.id}: ${input}`);
    
  } catch (error) {
    console.error('Error changing photo:', error);
    ctx.reply('❌ Gagal mengubah foto. Silakan coba lagi atau hubungi developer.');
  }
};

module.exports = changePhotoHandler;
