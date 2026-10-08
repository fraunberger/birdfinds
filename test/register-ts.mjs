import { register } from 'node:module';

// Install the extensionless-TypeScript resolver for the test run.
register(new URL('./ts-resolver.mjs', import.meta.url));
