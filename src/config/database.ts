import { Pool } from 'pg';

export function createPool(connectionString: string): Pool {
  return new Pool({ connectionString });
}
