import fs from "fs";
import path from "path";

const repoRoot = path.resolve(process.cwd(), "..");
const ignoredDirectories = new Set([
  ".git",
  "node_modules",
  "backend/node_modules",
  "frontend/node_modules",
  "backend/dist",
  "frontend/dist",
]);

const suspiciousFileNames = new Set([
  ".cookiejar",
  "np.cookies",
  "cookies.txt",
  "cookie.txt",
  "token.txt",
  "tokens.txt",
  "session.txt",
  "session.json",
]);

const suspiciousExtensions = new Set([".cookies", ".har"]);

const walkFiles = (directory: string): string[] => {
  const entries = fs.readdirSync(directory, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path
      .relative(repoRoot, absolutePath)
      .replace(/\\/g, "/");

    if (entry.isDirectory()) {
      if (
        ignoredDirectories.has(relativePath) ||
        ignoredDirectories.has(entry.name)
      ) {
        continue;
      }
      found.push(...walkFiles(absolutePath));
      continue;
    }

    found.push(relativePath);
  }

  return found;
};

describe("secret artifact guard", () => {
  it("does not leave committable cookie or token artifact files in the repo", () => {
    const suspiciousFiles = walkFiles(repoRoot).filter((relativePath) => {
      const fileName = path.basename(relativePath).toLowerCase();
      const extension = path.extname(relativePath).toLowerCase();

      return (
        suspiciousFileNames.has(fileName) || suspiciousExtensions.has(extension)
      );
    });

    expect(suspiciousFiles).toEqual([]);
  });
});
