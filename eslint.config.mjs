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

  // ── JS 通用規則 ──
  {
    files: ["**/*.js", "**/*.mjs"],
    ...js.configs.recommended,
    rules: {
      ...js.configs.recommended.rules,
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-undef": "off",
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
      "no-undef": "off",
    },
  })),
];
