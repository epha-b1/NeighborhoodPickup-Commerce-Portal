import fs from "node:fs";
import path from "node:path";

const sourceRoot = path.resolve(process.cwd(), "src");

const walk = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...walk(fullPath));
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
};

if (!fs.existsSync(sourceRoot)) {
  console.error("[ts-only-source] Missing src directory.");
  process.exit(1);
}

const jsFiles = walk(sourceRoot)
  .filter((filePath) => filePath.endsWith(".js"))
  .map((filePath) =>
    path.relative(process.cwd(), filePath).replaceAll("\\", "/"),
  );

if (jsFiles.length > 0) {
  console.error("[ts-only-source] Found generated .js files under src/:");
  for (const filePath of jsFiles) {
    console.error(`- ${filePath}`);
  }
  process.exit(1);
}

console.log("[ts-only-source] OK: no generated .js files found under src/");
