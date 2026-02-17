import fs from "node:fs/promises";
import process from "node:process";
import pg from "pg";

const { Pool } = pg;

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }

  const schemaSql = await fs.readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
  const pool = new Pool({ connectionString });

  try {
    await pool.query(schemaSql);
    console.log("Migration complete");
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
