const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'categories.json');

const initDB = () => {
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ categories: [] }));
  }
};

const readDB = () => {
  initDB();
  try {
    const data = fs.readFileSync(dbPath, 'utf8');
    if (!data || data.trim() === '') {
      return { categories: [] };
    }
    return JSON.parse(data);
  } catch (error) {
    return { categories: [] };
  }
};

const writeDB = (data) => {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
};

const getAllCategories = () => {
  const db = readDB();
  return db.categories;
};

const addCategory = (name) => {
  const db = readDB();
  const exists = db.categories.find(cat => cat.name.toLowerCase() === name.toLowerCase());
  if (exists) return null;
  
  const category = {
    id: Date.now(),
    name: name,
    createdAt: new Date().toISOString()
  };
  db.categories.push(category);
  writeDB(db);
  return category;
};

const deleteCategory = (id) => {
  const db = readDB();
  const index = db.categories.findIndex(cat => cat.id === id);
  if (index === -1) return false;
  db.categories.splice(index, 1);
  writeDB(db);
  return true;
};

const deleteCategoryByName = (name) => {
  const db = readDB();
  const index = db.categories.findIndex(cat => cat.name.toLowerCase() === name.toLowerCase());
  if (index === -1) return false;
  db.categories.splice(index, 1);
  writeDB(db);
  return true;
};

module.exports = {
  getAllCategories,
  addCategory,
  deleteCategory,
  deleteCategoryByName
};
