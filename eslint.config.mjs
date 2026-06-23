import pluginVue from "eslint-plugin-vue";
import js from "@eslint/js";

export default [
  // ── 忽略的目錄 ──
  {
    ignores: [
      "renderer/dist/**",
      "node_modules/**",
      "build/**",
      "dist/**",
    ],
  },

  // ── 通用環境與全域變數 ──
  {
    files: ["**/*.js", "**/*.mjs", "**/*.vue"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        // Node.js
        require: "readonly",
        module: "readonly",
        process: "readonly",
        __dirname: "readonly",
        Buffer: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        console: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        // Browser
        window: "readonly",
        document: "readonly",
        navigator: "readonly",
        M: "readonly",
        lucide: "readonly",
        confirm: "readonly",
        alert: "readonly",
        CustomEvent: "readonly",
        Event: "readonly",
      }
    }
  },

  // ── JS 通用規則 ──
  {
    files: ["**/*.js", "**/*.mjs"],
    ...js.configs.recommended,
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
      "no-empty": "warn",
      "no-console": "off",
      "no-prototype-builtins": "warn",
    },
  },

  // ── Vue SFC 規則 ──
  ...pluginVue.configs["flat/essential"].map(config => ({
    ...config,
    rules: {
      ...config.rules,
      "vue/multi-word-component-names": "off",
      "vue/no-unused-vars": "warn",
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "error",
    },
  })),
];
