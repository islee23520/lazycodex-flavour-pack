# LFP TypeScript source

Runtime implementations live under domain folders in this directory. Public `scripts/*.mjs` files are entry point wrappers (bin and hooks only) that load compiled modules from `dist/src`. Tests import directly from `src/` via `tsx`.
