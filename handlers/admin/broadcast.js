const { getAllUsers } = require('../../database/users');

const broadcastHandler = async (ctx) => {
  const message = ctx.message.text.replace('/broadcast', '').trim();
  
  if (!message) {
    return ctx.reply('❌ Format: /broadcast <pesan>\n\nContoh:\n/broadcast Halo semua!');
  }
  
  const users = getAllUsers();
  let success = 0;
  let failed = 0;
  
  ctx.reply(`📢 Mengirim broadcast ke ${users.length} user...`);
  
  for (const user of users) {
    try {
      await ctx.telegram.sendMessage(user.id, message);
      success++;
      await new Promise(resolve => setTimeout(resolve, 50));
    } catch (error) {
      failed++;
    }
  }
  
  ctx.reply(`✅ Broadcast selesai!\n\n` +
    `✔️ Berhasil: ${success}\n` +
    `❌ Gagal: ${failed}`);
};

module.exports = broadcastHandler;
