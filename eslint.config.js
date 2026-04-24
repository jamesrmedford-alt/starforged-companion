import js from "@eslint/js";

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        // Foundry VTT globals — available at runtime, not imported
        game:   "readonly",
        ui:     "readonly",
        Hooks:  "readonly",
        CONST:  "readonly",
        foundry: "readonly",
        ChatMessage: "readonly",
        $:      "readonly",
      },
    },
    rules: {
      "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console":     "off",
    },
  },
  {
    // Test files can use Jest globals
    files: ["tests/**/*.js"],
    languageOptions: {
      globals: {
        describe:  "readonly",
        it:        "readonly",
        expect:    "readonly",
        beforeEach: "readonly",
        afterEach:  "readonly",
      },
    },
  },
];
