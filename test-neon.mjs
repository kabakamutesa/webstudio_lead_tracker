import fs from 'node:fs';
import { neon } from '@neondatabase/serverless';

const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(Boolean).map(line => {
  const i = line.indexOf('=');
  return [line.slice(0, i), line.slice(i + 1).replace(/^"|"$/g, '')];
}));

const sql = neon(env.DATABASE_URL);

try {
  const database = await sql`select current_database() as database`;
  const tables = await sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`;
  const leadColumns = await sql`select column_name from information_schema.columns where table_schema='public' and table_name='leads' order by ordinal_position`;
  const settingColumns = await sql`select column_name from information_schema.columns where table_schema='public' and table_name='settings' order by ordinal_position`;
  const leadCount = await sql`select count(*)::text as count from leads`;
  const settingCount = await sql`select count(*)::text as count from settings`;
  console.log(JSON.stringify({
    database: database[0].database,
    tables: tables.map(row => row.table_name),
    leadColumns: leadColumns.map(row => row.column_name),
    settingColumns: settingColumns.map(row => row.column_name),
    leadCount: leadCount[0].count,
    settingCount: settingCount[0].count
  }, null, 2));
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
