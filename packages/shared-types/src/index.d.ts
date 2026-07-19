// Type-only package: apps/web imports these with `import type`, so no build
// step or transpilation is needed. Regenerate agent-api.d.ts via `just codegen`.
export type { components, operations, paths } from "./agent-api";
