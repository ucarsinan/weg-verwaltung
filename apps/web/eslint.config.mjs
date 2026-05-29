// Flat config for ESLint 9 + Next 16. The previous FlatCompat-based bridge
// crashes with a circular-JSON error against eslint-config-next ≥16 because
// the package now ships flat configs natively — re-wrapping them via the
// legacy compat layer trips JSON.stringify on the plugin graph.
//
// We consume the flat exports directly:
//   eslint-config-next/core-web-vitals — React + a11y + import + next/core
//   eslint-config-next/typescript      — @typescript-eslint parser + plugin
import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescriptConfig from "eslint-config-next/typescript";

const config = [
  ...coreWebVitals,
  ...typescriptConfig,
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },
];

export default config;
