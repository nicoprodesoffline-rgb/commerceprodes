import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import ts from 'typescript';
const require = createRequire(import.meta.url);
export const root = path.resolve(import.meta.dirname, '../..');
export function loader(stubs = {}) {
  const cache = new Map();
  function load(file) {
    const full = path.resolve(root, file);
    if (cache.has(full)) return cache.get(full).exports;
    const mod = { exports: {} }; cache.set(full, mod);
    const code = ts.transpileModule(readFileSync(full, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    new Function('require', 'module', 'exports', code)(name => {
      if (name in stubs) return stubs[name];
      if (name.startsWith('.') || name.startsWith('@/')) {
        const base = name.startsWith('@/') ? path.join(root, name.slice(2)) : path.resolve(path.dirname(full), name);
        const candidate = [base, base + '.ts', base + '.tsx'].find(f => existsSync(f) && /\.(tsx?|js)$/.test(f));
        if (!candidate) throw new Error(`Module missing: ${name}`);
        return load(candidate);
      }
      return require(name);
    }, mod, mod.exports);
    return mod.exports;
  }
  return load;
}
export const read = file => readFileSync(path.join(root, file), 'utf8');
