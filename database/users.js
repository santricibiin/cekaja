const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'users.json');

const initDB = () => {
  if (!fs.existsSync(dbPath)) {
    fs.writeFileSync(dbPath, JSON.stringify({ users: {} }));
  }
};

const readDB = () => {
  initDB();
  try {
    const data = fs.readFileSync(dbPath, 'utf8');
    if (!data || data.trim() === '') {
      return { users: {} };
    }
    return JSON.parse(data);
  } catch (error) {
    return { users: {} };
  }
};

const writeDB = (data) => {
  fs.writeFileSync(dbPath, JSON.stringify(data, null, 2));
};

const getUser = (userId) => {
  const db = readDB();
  return db.users[userId] || null;
};

const createUser = (userId, username) => {
  const db = readDB();
  if (!db.users[userId]) {
    db.users[userId] = {
      id: userId,
      username: username || 'Unknown',
      balance: 0,
      joinedAt: new Date().toISOString()
    };
    writeDB(db);
  }
  return db.users[userId];
};

const updateBalance = (userId, amount) => {
  const db = readDB();
  if (db.users[userId]) {
    db.users[userId].balance += amount;
    writeDB(db);
    return db.users[userId];
  }
  return null;
};

const getAllUsers = () => {
  const db = readDB();
  return Object.values(db.users);
};

module.exports = {
  getUser,
  createUser,
  updateBalance,
  getAllUsers
};
