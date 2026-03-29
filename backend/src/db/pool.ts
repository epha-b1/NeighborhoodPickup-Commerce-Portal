import { createPool } from 'mysql2/promise';
import { env } from '../config/env';

export const dbPool = createPool({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: env.db.database,
  connectionLimit: env.db.connectionLimit,
  timezone: 'Z'
});