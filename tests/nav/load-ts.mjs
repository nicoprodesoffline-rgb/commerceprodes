// Charge un module TypeScript du site (transpilé à la volée, sans serveur ni catalogue) : les modules du cercle 5 importent le C0 gelé, dont la syntaxe n'est pas lisible en mode « retrait des types ».
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import ts from "typescript";

const root = path.resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);
const cache = new Map();

function read(filename) {
  if (cache.has(filename)) return cache.get(filename).exports;
  const module = { exports: {} };
  cache.set(filename, module);
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2022, resolveJsonModule: true, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  const localRequire = (name) => {
    if (name.startsWith("@/") || name.startsWith(".")) {
      const base = name.startsWith("@/") ? path.join(root, name.slice(2)) : path.resolve(path.dirname(filename), name);
      const found = [base, `${base}.ts`, `${base}.tsx`].find((f) => fs.existsSync(f) && fs.statSync(f).isFile());
      if (found === undefined) throw new Error(`module introuvable : ${name}`);
      return found.endsWith(".json") ? JSON.parse(fs.readFileSync(found, "utf8")) : read(found);
    }
    return require(name);
  };
  new Function("require", "module", "exports", code)(localRequire, module, module.exports);
  return module.exports;
}

export const load = (file) => read(path.join(root, file));
