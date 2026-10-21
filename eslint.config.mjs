import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

const eslintConfig = [
  // demo/ is a separate Next.js project with its own lint config.
  { ignores: ["demo/**"] },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      "react-hooks/immutability": "off",
      "react-hooks/refs": "off",
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // enc-lint-e2e-debt: deuda `no-explicit-any` preexistente scopeada a los
  // 5 ficheros legacy (warn) mientras el encargo la paga. Fuera de aquí la
  // regla sigue siendo error — nada nuevo entra con any.
  {
    files: [
      "components/EncargosView.tsx",
      "components/ExoProposalsView.tsx",
      "lib/app-update.ts",
      "lib/exo-data.ts",
      "lib/i18n/registry.ts",
    ],
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "warn",
    },
  },
];

export default eslintConfig;
