const postgres = require('postgres');

const connectionString = process.env.DATABASE_URL || 
  'postgresql://postgres.sb_publishable_N6ywVrQrlwZ63ndrb_YikA_dtV2YCsL@db.ksqckiygpyyenkqazlou.supabase.co:5432/postgres';

const sql = postgres(connectionString);

module.exports = sql;
