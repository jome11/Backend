const knex = require('knex')({
  client: 'sqlite3',
  connection: {
    filename: './begena.db'
  },
  useNullAsDefault: true
});

// Create tables if they don't exist
const initDB = async () => {
  const usersExists = await knex.schema.hasTable('users');
  if (!usersExists) {
    await knex.schema.createTable('users', table => {
      table.increments('id');
      table.string('name').notNullable();
      table.string('email').unique().notNullable();
      table.string('password').notNullable();
      table.string('role').defaultTo('student');
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
    console.log('Users table created');
  }

  const progressExists = await knex.schema.hasTable('progress');
  if (!progressExists) {
    await knex.schema.createTable('progress', table => {
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
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });
    console.log('Progress table created');
  }
};

initDB().catch(console.error);

module.exports = knex;