import {defineConfig} from 'vitest/config';
import {readFileSync} from 'node:fs';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
  },
  plugins: [
    {
      name: 'md-loader',
      transform(_src, id) {
        if (id.endsWith('.md')) {
          // Read the actual file content
          const content = readFileSync(id, 'utf-8');
          const code = `export default ${JSON.stringify(content)};`;
          return {code, map: null};
        }
      },
    },
  ],
});
