/**
 * Vitest global setup. Loaded once before any test runs.
 *
 * Pulls in `@testing-library/jest-dom` matchers so test files can use
 * things like `expect(el).toBeInTheDocument()`.
 */
import '@testing-library/jest-dom/vitest';
