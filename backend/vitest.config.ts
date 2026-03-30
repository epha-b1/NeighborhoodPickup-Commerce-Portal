import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    globals: true,
    testTimeout: 15000,
    setupFiles: ["test/setup-env.ts"],
    clearMocks: true,
    restoreMocks: true,
    exclude: [
      "dist/**",
      "node_modules/**",
      "test/contracts/apiSpecSync.test.ts",
      "test/security/secretArtifactGuard.test.ts",
    ],
  },
});
