require('dotenv').config();
const db = require('./src/database');

(async () => {
  const users = await db('users').select('*');
  console.log('--- Users ---');
  console.table(users);

  const progress = await db('progress').select('*');
  console.log('--- Progress ---');
  console.table(progress);

  process.exit(0);
})();