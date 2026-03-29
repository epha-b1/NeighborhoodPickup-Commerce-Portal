import fs from "fs/promises";
import path from "path";
import type { RowDataPacket } from "mysql2";
import { dbPool } from "./pool";
import { logger } from "../utils/logger";

type Direction = "up" | "down";
type MigrationRow = RowDataPacket & { name: string };

const splitSqlStatements = (sql: string): string[] =>
  sql
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

const executeSqlStatements = async (
  runQuery: (sql: string) => Promise<unknown>,
  sql: string,
): Promise<void> => {
  const statements = splitSqlStatements(sql);
  for (const statement of statements) {
    await runQuery(statement);
  }
};

const migrationsDir = path.resolve(__dirname, "migrations");

const ensureMigrationsTable = async (): Promise<void> => {
  const initialSql = await fs.readFile(
    path.join(migrationsDir, "0001_create_migrations_table.sql"),
    "utf8",
  );
  await executeSqlStatements(
    (statement) => dbPool.query(statement),
    initialSql,
  );
};

const getAppliedMigrations = async (): Promise<Set<string>> => {
  const [rows] = await dbPool.query<MigrationRow[]>(
    "SELECT name FROM migrations",
  );
  return new Set(rows.map((row) => row.name));
};

const runUp = async (): Promise<void> => {
  await ensureMigrationsTable();

  const files = (await fs.readdir(migrationsDir))
    .filter((file) => file.endsWith(".sql") && !file.endsWith(".down.sql"))
    .sort();

  const applied = await getAppliedMigrations();

  for (const file of files) {
    if (applied.has(file)) {
      continue;
    }

    const sql = await fs.readFile(path.join(migrationsDir, file), "utf8");
    const conn = await dbPool.getConnection();
    try {
      await conn.beginTransaction();
      await executeSqlStatements((statement) => conn.query(statement), sql);
      await conn.query("INSERT INTO migrations (name) VALUES (?)", [file]);
      await conn.commit();
      logger.info("db.migration.applied", `Applied migration: ${file}`, {
        migration: file,
      });
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
  }
};

const runDown = async (): Promise<void> => {
  await ensureMigrationsTable();

  const [rows] = await dbPool.query<MigrationRow[]>(
    "SELECT name FROM migrations ORDER BY id DESC LIMIT 1",
  );

  if (rows.length === 0) {
    logger.info(
      "db.migration.rollback.none",
      "No applied migrations to roll back.",
    );
    return;
  }

  const lastMigration = rows[0].name;

  if (lastMigration === "0001_create_migrations_table.sql") {
    await dbPool.query("DELETE FROM migrations WHERE name = ?", [
      lastMigration,
    ]);
    logger.info(
      "db.migration.base_marker.removed",
      "Removed base migrations marker.",
      { migration: lastMigration },
    );
    return;
  }

  const downFile = `${lastMigration.replace(/\.sql$/, "")}.down.sql`;
  const downPath = path.join(migrationsDir, downFile);
  const sql = await fs.readFile(downPath, "utf8");

  const conn = await dbPool.getConnection();
  try {
    await conn.beginTransaction();
    await executeSqlStatements((statement) => conn.query(statement), sql);
    await conn.query("DELETE FROM migrations WHERE name = ?", [lastMigration]);
    await conn.commit();
    logger.info(
      "db.migration.rolled_back",
      `Rolled back migration: ${lastMigration}`,
      { migration: lastMigration },
    );
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
};

const main = async (): Promise<void> => {
  const direction = (process.argv[2] ?? "up") as Direction;
  if (direction === "down") {
    await runDown();
  } else {
    await runUp();
  }
  await dbPool.end();
};

main().catch(async (error) => {
  logger.error("db.migration.failed", "Migration command failed.", {
    error: error instanceof Error ? error.message : String(error),
  });
  await dbPool.end();
  process.exit(1);
});
