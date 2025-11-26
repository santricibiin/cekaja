require('dotenv').config();

module.exports = {
  botToken: process.env.BOT_TOKEN,
  adminId: parseInt(process.env.ADMIN_ID),
  photoUrl: process.env.PHOTO_URL,
  qrisCode: process.env.QRIS_CODE
};
