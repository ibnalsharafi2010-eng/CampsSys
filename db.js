const postgres = require('postgres');

const connectionString = process.env.DATABASE_URL || 
  'postgresql://postgres.sb_publishable_s7H2Ion6rXEWvNfMCMi2Uw_cfxLwYfY@aws-0-me-south-1.pooler.supabase.com:6543/postgres';

const sql = postgres(connectionString);

module.exports = sql;
