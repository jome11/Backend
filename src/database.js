const knex = require('knex');
const Client_Libsql = require('@libsql/knex-libsql');

const db = knex({
  client: Client_Libsql,
  connection: {
    filename: `${process.env.TURSO_DATABASE_URL}?authToken=${process.env.TURSO_AUTH_TOKEN}`,
  },
  useNullAsDefault: true,
});

// Create tables if they don't exist
const initDB = async () => {
  const usersExists = await db.schema.hasTable('users');
  if (!usersExists) {
    await db.schema.createTable('users', table => {
      table.increments('id');
      table.string('name').notNullable();
      table.string('email').unique().notNullable();
      table.string('password').notNullable();
      table.string('role').defaultTo('student');
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
    console.log('Users table created');
  }

  const progressExists = await db.schema.hasTable('progress');
  if (!progressExists) {
    await db.schema.createTable('progress', table => {
      table.increments('id');
      table.integer('user_id').notNullable();
      table.string('mode').notNullable();
      table.string('qenet');
      table.integer('correct').defaultTo(0);
      table.integer('wrong').defaultTo(0);
      table.integer('accuracy').defaultTo(0);
      table.integer('session_num').defaultTo(0);
      table.string('mezmur_name');
      table.text('finger_mistakes').defaultTo('{}');
      table.text('finger_successes').defaultTo('{}');
      table.timestamp('created_at').defaultTo(db.fn.now());
    });
    console.log('Progress table created');
  }
};

initDB().catch(console.error);

module.exports = db;