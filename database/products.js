const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'products.json');

const initDB = () => {
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ products: [] }));
  }
};

const readDB = () => {
  initDB();
  try {
    const data = fs.readFileSync(dbPath, 'utf8');
    if (!data || data.trim() === '') {
      return { products: [] };
    }
    return JSON.parse(data);
  } catch (error) {
    return { products: [] };
  }
};

const writeDB = (data) => {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
};

const addProduct = (categoryName, code, name, price, detail) => {
  const db = readDB();
  const product = {
    id: Date.now() + Math.random(),
    categoryName: categoryName,
    code: code,
    name: name,
    price: parseInt(price),
    detail: detail,
    createdAt: new Date().toISOString()
  };
  db.products.push(product);
  writeDB(db);
  return product;
};

const getProductsByCategory = (categoryName) => {
  const db = readDB();
  return db.products.filter(p => p.categoryName.toLowerCase() === categoryName.toLowerCase());
};

const getProductByCode = (code) => {
  const db = readDB();
  return db.products.find(p => p.code && p.code.toLowerCase() === code.toLowerCase());
};

const getAllProducts = () => {
  const db = readDB();
  return db.products;
};

module.exports = {
  addProduct,
  getProductsByCategory,
  getProductByCode,
  getAllProducts
};
