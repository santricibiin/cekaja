const { addProduct } = require('../../database/products');
const { getAllCategories } = require('../../database/categories');

const addProductHandler = async (ctx) => {
  const input = ctx.message.text.replace('/addproduk', '').trim();
  
  if (!input) {
    return ctx.reply('❌ Format: /addproduk kategori,code,nama,harga,detail\n\nContoh:\n/addproduk Canva,CP001,CANVA PRO 1 BULAN,5000,Bergaransi');
  }
  
  const parts = input.split(',').map(p => p.trim());
  
  if (parts.length < 5) {
    return ctx.reply('❌ Minimal 1 produk: kategori,code,nama,harga,detail');
  }
  
  const categoryName = parts[0];
  const categories = getAllCategories();
  const categoryExists = categories.find(c => c.name.toLowerCase() === categoryName.toLowerCase());
  
  if (!categoryExists) {
    return ctx.reply(`❌ Kategori "${categoryName}" tidak ditemukan!`);
  }
  
  const products = [];
  for (let i = 1; i < parts.length; i += 4) {
    if (i + 3 < parts.length) {
      const code = parts[i];
      const name = parts[i + 1];
      const price = parts[i + 2];
      const detail = parts[i + 3];
      
      if (!isNaN(price)) {
        addProduct(categoryName, code, name, price, detail);
        products.push(name);
      }
    }
  }
  
  if (products.length > 0) {
    ctx.reply(`✅ Berhasil menambahkan ${products.length} produk ke kategori "${categoryName}":\n${products.map((p, i) => `${i + 1}. ${p}`).join('\n')}`);
  } else {
    ctx.reply('❌ Tidak ada produk yang ditambahkan. Periksa format!');
  }
};

module.exports = addProductHandler;
