import { defineConfig } from '@hey-api/openapi-ts';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the API base URL from environment variables
const apiBaseUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://backend:8003';

// Check if we're in a build environment or runtime environment
const isRuntimeGeneration = process.env.NODE_ENV === 'production';

let input;
if (isRuntimeGeneration) {
  // At runtime, use the service name from Docker Compose
  input = `${apiBaseUrl}/openapi.json`;
} else {
  // During development, use localhost or provided URL
  const devApiUrl = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8003';
  input = `${devApiUrl}/openapi.json`;
}

console.log('OpenAPI input:', input);

export default defineConfig({
  input,
  output: {
    format: 'prettier',
    lint: 'eslint',
    path: './api-client',
  },
  plugins: [
    '@hey-api/client-fetch',
    '@hey-api/schemas',
    {
      dates: true,
      name: '@hey-api/transformers',
    },
    {
      enums: 'javascript',
      name: '@hey-api/typescript',
    },
    {
      name: '@hey-api/sdk',
      transformer: true,
    },
  ],
});
