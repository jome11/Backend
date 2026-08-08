const db = require('./src/database');
console.log('DB connected OK');

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all();
console.log('Tables:', tables);

const cols = db.prepare("PRAGMA table_info(progress)").all();
console.log('Progress columns:', cols.map(c => c.name));