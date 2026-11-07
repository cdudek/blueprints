// Lets plain Node run the worker's TypeScript the way Next.js resolves it: `@/` is src/, project
// imports may omit the extension, and packages resolve with the react-server condition, so
// `import "server-only"` is a no-op as it is on the Next.js server. Node strips the types itself
// (tsconfig's erasableSyntaxOnly keeps the code strippable).
import { statSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const src = fileURLToPath(new URL("../src/", import.meta.url));
const isFile = (/** @type {string} */ p) => statSync(p, { throwIfNoEntry: false })?.isFile();

registerHooks({
  resolve(specifier, context, nextResolve) {
    const conditions = [...(context.conditions ?? []), "react-server"];
    const parent = context.parentURL ?? "";
    let base = null;
    if (specifier.startsWith("@/")) base = src + specifier.slice(2);
    else if (
      /^\.\.?\//.test(specifier) &&
      parent.startsWith("file:") &&
      !parent.includes("/node_modules/")
    )
      base = fileURLToPath(new URL(specifier, parent));
    const file =
      base && [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`].find((p) => isFile(p));
    return nextResolve(file ? pathToFileURL(file).href : specifier, { ...context, conditions });
  },
});
