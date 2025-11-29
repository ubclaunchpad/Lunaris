import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";
import { defineConfig, globalIgnores } from "eslint/config";
import globals from "globals";
import eslintJs from "@eslint/js";
import tseslint from "typescript-eslint";
import cdkPlugin from "eslint-plugin-awscdk";
import eslintConfigPrettier from "eslint-config-prettier/flat";

// Use FlatCompat to apply legacy eslint configs (like next/core-web-vitals)
// in the new flat config. baseDirectory points to the frontend folder so Next
// plugins resolve correctly in a monorepo (Next needs to be installed alongside its eslint config)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: join(__dirname, "frontend") });

export default defineConfig([
    // Globals
    globalIgnores([
        "**/node_modules/**",
        "**/dist/**",
        "**/build/**",
        "**/out/**",
        "**/test/**",
        "**/*.config.js",
    ]),
    eslintConfigPrettier,
    {
        files: ["**/*.{js,jsx,mjs,cjs}"],
        extends: [eslintJs.configs.recommended],
    },
    {
        files: ["**/*.{ts,tsx,mts,cts}"],
        extends: [...tseslint.configs.recommended],
    },
    // Frontend config
    ...compat.extends("next/core-web-vitals", "next/typescript").map((config) => ({
        ...config,
        basePath: "frontend",
        files: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
    })),
    {
        basePath: "frontend",
        files: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"],
        ignores: [".next/**", "next-env.d.ts"],
        settings: {
            next: {
                rootDir: "frontend",
            },
        },
        languageOptions: {
            globals: { ...globals.browser },
            parserOptions: {
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
    },
    // CDK config
    {
        basePath: "cdk",
        files: ["**/*.{ts,mts,cts,js,mjs,cjs}"],
        extends: [cdkPlugin.configs.recommended],
        languageOptions: {
            globals: { ...globals.node },
        },
        rules: {
            "awscdk/no-construct-stack-suffix": "off",
            "awscdk/no-variable-construct-id": "off",
            "awscdk/no-mutable-property-of-props-interface": "off", // seems too noisy for now as it enforces thie rule on all types that end with "Props"
        },
    },
    // Lambda config
    {
        basePath: "lambda",
        files: ["**/*.{ts,mts,cts,js,mjs,cjs}"],
        languageOptions: {
            globals: { ...globals.node },
        },
    },
    // Rule overrides
    {
        files: ["**/*.{js,jsx,mjs,cjs}"],
        rules: {
            "no-unused-vars": ["warn", { argsIgnorePattern: "^_$" }],
        },
    },
    {
        files: ["**/*.{ts,tsx,mts,cts}"],
        rules: {
            "@typescript-eslint/no-require-imports": "off",
            "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_$" }],
        },
    },
]);
