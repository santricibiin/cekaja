const { adminId } = require('../config/config');

const isAdmin = (ctx, next) => {
  if (ctx.from.id === adminId) {
    return next();
  }
  ctx.reply('⛔ Anda tidak memiliki akses ke perintah ini.');
};

module.exports = { isAdmin };
