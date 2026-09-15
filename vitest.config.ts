import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      obsidian: new URL('./src/testSupport/obsidianMock.ts', import.meta.url).pathname
    }
  },
  test: {
    include: ['src/**/*.test.ts']
  }
});
