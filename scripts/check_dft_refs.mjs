#!/usr/bin/env node
/**
 * Check every reference with a DOI in dft/terms.json against its Crossref record.
 *
 * The year, volume and first page (or article number) from Crossref must all appear in the
 * reference text; the Crossref title and first authors are printed next to ours for a visual
 * check. Exits with status 1 if any reference disagrees or a DOI does not resolve.
 *
 * Run: node scripts/check_dft_refs.mjs   (needs network access)
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const { refs } = JSON.parse(readFileSync(join(ROOT, "dft", "terms.json"), "utf8"));
const plain = s => s.replace(/<[^>]+>/g, "").replace(/\s+/g, " ");

let bad = 0;
for (const [key, r] of Object.entries(refs)) {
  if (!r.doi) continue;
  const res = await fetch(`https://api.crossref.org/works/${encodeURIComponent(r.doi)}`, {
    headers: { "User-Agent": "oridwan.github.io DFT course reference check" },
  });
  if (!res.ok) { console.log(`MISSING   ${key}  doi:${r.doi} (HTTP ${res.status})`); bad++; continue; }
  const m = (await res.json()).message;
  const year = String(m.issued?.["date-parts"]?.[0]?.[0] ?? "");
  const page = String(m.page ?? m["article-number"] ?? "").split("-")[0];
  const text = plain(r.text);
  const missing = [["year", year], ["volume", m.volume], ["page", page]]
    .filter(([, v]) => v && !text.includes(String(v)))
    .map(([k, v]) => `${k} ${v}`);
  const who = (m.author || []).slice(0, 3).map(a => a.family).join(", ");
  console.log(`${missing.length ? "MISMATCH" : "ok      "}  ${key}  ${m["container-title"]?.[0] ?? ""} ${m.volume ?? ""}, ${page} (${year})`);
  console.log(`          Crossref: ${who}: ${plain(m.title?.[0] ?? "")}`);
  if (missing.length) { console.log(`          not in our text: ${missing.join("; ")}`); bad++; }
}
console.log(bad ? `\n${bad} reference(s) need attention.` : "\nAll DOIs match their Crossref records.");
process.exit(bad ? 1 : 0);
