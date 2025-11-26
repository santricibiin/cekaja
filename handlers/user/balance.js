const { getUser } = require('../../database/users');

const balanceHandler = async (ctx) => {
  const userId = ctx.from.id;
  const user = getUser(userId);
  
  if (!user) {
    return ctx.reply('❌ User tidak ditemukan. Silakan ketik /start terlebih dahulu.');
  }
  
  const message = `💰 Saldo Anda\n\n` +
    `👤 User: ${user.username}\n` +
    `💵 Saldo: Rp ${user.balance.toLocaleString('id-ID')}`;
  
  ctx.reply(message);
};

module.exports = balanceHandler;
