import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import * as vueCompiler from "@vue/compiler-sfc";

export default defineConfig({
  plugins: [vue({ compiler: vueCompiler })],
  resolve: {
    extensions: [".ts", ".tsx", ".mjs", ".js", ".mts", ".jsx", ".json"],
  },
});
