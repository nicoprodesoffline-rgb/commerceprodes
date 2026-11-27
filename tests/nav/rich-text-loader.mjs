// Charge lib/site-content/rich-text.ts dans un test Node : la lecture du texte libre est celle du contrat (c0v2/ts/src/content.ts), lue dans son build
// (npm run c0:build puis npm run c0v2:build). Le crochet ne change que la résolution : le contrat, écrit pour le bundler, n'a pas d'extension dans ses imports.
import { register } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const dist = pathToFileURL(fileURLToPath(new URL("../../c0v2/ts/dist/c0v2/ts/src/content.js", import.meta.url))).href;
register("data:text/javascript," + encodeURIComponent(`
export async function resolve(specifier, context, next) {
  if (specifier.endsWith("c0v2/ts/src/content")) return next(${JSON.stringify(dist)}, context);
  try { return await next(specifier, context); }
  catch (error) { if (error.code === "ERR_MODULE_NOT_FOUND" && specifier.startsWith(".")) return next(specifier + ".ts", context); throw error; }
}`), import.meta.url);

export const { richTextParagraphs } = await import("../../lib/site-content/rich-text.ts");
