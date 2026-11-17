import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postcss from "postcss";

const source = fileURLToPath(new URL("../../docs/manual/central-ajuda.css", import.meta.url));
const destination = fileURLToPath(new URL("../src/components/help/HelpCenter.module.css", import.meta.url));
const css = postcss.parse(readFileSync(source, "utf8"));
css.walkAtRules("page", rule => rule.remove());

// Mantém os mesmos estilos no HTML independente e na aplicação, isolados do restante das telas.
css.walkRules(rule => {
  rule.selectors = rule.selectors.map(selector =>
    [":root", "html", "body"].includes(selector)
      ? ".root"
      : ".root :global(" + (selector === "main" ? ".help-content" : selector) + ")",
  );
});

const integration = `
.root { min-width: 0; box-sizing: border-box; }
.root :global(.help-content) { padding: 0 0 30px; }
.root :global(.embedded-tools) { display: flex; justify-content: space-between; align-items: center; gap: 16px; margin-bottom: 8px; color: var(--muted); font-size: 12px; }
.root :global(.home-hero) { padding-top: 35px; }
.root :global(.help-article), .root :global(h2[id]) { scroll-margin-top: 106px; }
@media (max-width: 1400px) {
  .root :global(.article-layout) { grid-template-columns: 180px minmax(0, 1fr); }
  .root :global(.article-toc) { display: none; }
}
@media (max-width: 760px) {
  .root :global(.article-layout) { display: block; }
  .root :global(.embedded-tools) { flex-wrap: wrap; }
}
@media print {
  :global(body):has(.root) { visibility: hidden; }
  .root { visibility: visible; }
  :global(body):has(.root) :global(header),
  :global(body):has(.root) :global(header + div),
  :global(body):has(.root) :global(aside.fixed) { display: none !important; }
  :global(body):has(.root) :global(div:has(> main)) { padding: 0 !important; }
  :global(body):has(.root) :global(main) { padding: 0 !important; max-width: none !important; }
  .root :global(.embedded-tools) { display: none; }
}
`;

writeFileSync(destination, "/* Gerado por scripts/build-help-css.mjs. */\n" + css.toString() + integration);
