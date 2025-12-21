# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture

This is a pnpm monorepo containing the Vercel Storage packages:

- `@vercel/blob` - Fast object storage client
- `@vercel/kv` - Redis-compatible key-value store client
- `@vercel/edge-config` - Ultra-low latency edge data client
- `@vercel/postgres` - PostgreSQL database client
- `@vercel/postgres-kysely` - Kysely ORM wrapper for @vercel/postgres

The packages are designed to work in multiple JavaScript environments:

- Node.js (serverless and server environments)
- Edge runtime (Vercel Edge Functions)
- Browser environments

Each package includes environment-specific implementations and comprehensive test coverage across all supported runtimes.

## Common Commands

### Development & Testing

- `pnpm build` - Build all packages using Turbo
- `pnpm test` - Run all tests across packages
- `pnpm lint` - Lint all packages with ESLint (max warnings: 0)
- `pnpm type-check` - TypeScript type checking across packages
- `pnpm prettier-check` - Check code formatting
- `pnpm prettier-fix` - Fix code formatting

### Package-specific Commands

Run commands in specific packages using `-F` flag:

- `pnpm -F @vercel/blob test` - Test blob package only
- `pnpm -F @vercel/blob build` - Build blob package only

### Testing Strategy

Each package includes multi-environment testing:

- `test:node` - Node.js environment tests
- `test:edge` - Edge runtime environment tests
- `test:browser` - Browser environment tests (for applicable packages)
- `test:common` - Tests that run in multiple environments

### Integration Testing

- `pnpm run-integration` - Start the Next.js integration test suite
- `pnpm integration-test` - Run Playwright integration tests

## Key Files & Structure

### Package Structure

Each package follows consistent structure:

- `src/` - Source TypeScript files
- `dist/` - Built output (CJS + ESM)
- `tsconfig.json` - TypeScript configuration extending workspace config
- `tsup.config.js` - Build configuration
- Individual test files with environment suffixes (`.node.test.ts`, `.edge.test.ts`, etc.)

### Workspace Configuration

- `pnpm-workspace.yaml` - Defines workspace packages
- `turbo.json` - Task orchestration and caching
- `tooling/` - Shared ESLint and TypeScript configurations
- `test/next/` - Integration test suite using Next.js + Playwright

### Environment Handling

Packages use different strategies for multi-environment support:

- Browser-specific shims (e.g., `crypto-browser.js`, `stream-browser.js`)
- Conditional exports in package.json for different environments
- Environment-specific test suites using different Jest environments

## Development Notes

- Uses TypeScript with strict configuration
- ESLint extends @vercel/style-guide with zero warnings policy
- Jest for unit testing with @edge-runtime/jest-environment for edge testing
- Playwright for integration testing
- Changesets for version management and releases
- All packages support both CommonJS and ES modules via dual build
