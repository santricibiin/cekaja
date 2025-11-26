const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'stocks.json');

const initDB = () => {
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ stocks: [] }));
  }
};

const readDB = () => {
  initDB();
  try {
    const data = fs.readFileSync(dbPath, 'utf8');
    if (!data || data.trim() === '') {
      return { stocks: [] };
    }
    return JSON.parse(data);
  } catch (error) {
    return { stocks: [] };
  }
};

const writeDB = (data) => {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
};

const addStock = (productCode, detail) => {
  const db = readDB();
  const stock = {
    id: Date.now() + Math.random(),
    productCode: productCode,
    detail: detail,
    status: 'available',
    addedAt: new Date().toISOString()
  };
  db.stocks.push(stock);
  writeDB(db);
  return stock;
};

const getStocksByCode = (productCode) => {
  const db = readDB();
  return db.stocks.filter(s => s.productCode.toLowerCase() === productCode.toLowerCase() && s.status === 'available');
};

const getStockCount = (productCode) => {
  return getStocksByCode(productCode).length;
};

const useStock = (productCode, quantity = 1) => {
  const db = readDB();
  const availableStocks = db.stocks.filter(s => s.productCode.toLowerCase() === productCode.toLowerCase() && s.status === 'available');
  
  if (availableStocks.length < quantity) {
    return null;
  }
  
  const usedStocks = [];
  for (let i = 0; i < quantity; i++) {
    availableStocks[i].status = 'sold';
    availableStocks[i].soldAt = new Date().toISOString();
    usedStocks.push(availableStocks[i]);
  }
  
  writeDB(db);
  return usedStocks;
};

module.exports = {
  addStock,
  getStocksByCode,
  getStockCount,
  useStock
};
