// Lets `node --test --experimental-strip-types` load the app's TypeScript
// modules, which use extensionless relative imports (e.g. `./types`). Node's
// native resolver requires explicit extensions, so on a miss we retry with the
// TS extensions. Type stripping itself is handled by --experimental-strip-types.
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export async function resolve(specifier, context, nextResolve) {
    try {
        return await nextResolve(specifier, context);
    } catch (err) {
        if (specifier.startsWith('.') && context.parentURL) {
            for (const ext of ['.ts', '.tsx', '.mts']) {
                const candidate = new URL(specifier + ext, context.parentURL);
                if (existsSync(fileURLToPath(candidate))) {
                    return nextResolve(specifier + ext, context);
                }
            }
        }
        throw err;
    }
}
