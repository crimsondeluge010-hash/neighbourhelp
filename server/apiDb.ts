import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";

let pool: Pool | null = null;

export function getApiPool() {
  if (!process.env.DATABASE_URL) return null;
  if (!pool) pool = mysql.createPool(process.env.DATABASE_URL);
  return pool;
}

export async function queryRows<T extends RowDataPacket[]>(sql: string, params: unknown[] = []) {
  const db = getApiPool();
  if (!db) throw new Error("Database is not configured");
  const [rows] = await db.query<T>(sql, params);
  return rows;
}

export async function execute(sql: string, params: unknown[] = []) {
  const db = getApiPool();
  if (!db) throw new Error("Database is not configured");
  const [result] = await db.execute(sql, params);
  return result;
}

export async function withTransaction<T>(callback: (connection: mysql.PoolConnection) => Promise<T>) {
  const db = getApiPool();
  if (!db) throw new Error("Database is not configured");
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await callback(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}
