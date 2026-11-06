#!/usr/bin/env node
/**
 * Checks for the VASP cheat sheets: the INCAR parser and rules, every combination of the INCAR
 * builder, every INCAR block on the published sheets, the tag registry, and the shell commands,
 * which are run on real VASP output files when they are available locally
 * (dft/_research/testfiles: public test outputs of pymatgen and ASE; not committed).
 *
 * Run after the build: node scripts/build_dft.mjs && node scripts/test_cheat.mjs
 */
import { readFileSync, existsSync, mkdtempSync, symlinkSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";
import { parseIncar, lintIncar, expandValues, compressValues, buildIncar, incarText, allBuilderCombos } from "../dft/cheat-tools.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const terms = JSON.parse(readFileSync(join(ROOT, "dft/terms.json"), "utf8"));
const cheats = JSON.parse(readFileSync(join(ROOT, "dft/cheatsheets.json"), "utf8"));
const known = new Set(Object.keys(terms.tags));

let failed = 0, passed = 0;
function ok(name, cond, detail = "") {
  if (cond) passed++; else { failed++; console.log(`FAIL  ${name}${detail ? ": " + detail : ""}`); }
}
const ids = text => lintIncar(text, known).map(p => p.id);

// ---- parser ----
const p = parseIncar("ISMEAR = 0 ; SIGMA = 0.05  ! smearing\n# a comment\nMAGMOM = 2*5.0 \\\n  2*-5.0\nencut=520");
ok("parser: statements split at ;", p.length === 4 && p[0].tag === "ISMEAR" && p[1].tag === "SIGMA" && p[1].value === "0.05");
ok("parser: line continuation", p[2].tag === "MAGMOM" && expandValues(p[2].value).join(",") === "5,5,-5,-5");
ok("parser: lower-case tag", p[3].tag === "ENCUT" && p[3].value === "520");
ok("N*value round trip", compressValues(expandValues("3*5.0 -5 -5 0.6")) === "3*5.0 2*-5.0 0.6");

// ---- rules ----
ok("NSW > 0 without IBRION is an error", ids("ENCUT = 520\nNSW = 50").includes("ibrion-default"));
ok("IBRION = 0 without POTIM is an error", ids("ENCUT = 520\nIBRION = 0\nNSW = 10").includes("md-potim"));
ok("hybrid + ICHARG = 11 is an error", ids("ENCUT = 520\nLHFCALC = .TRUE.\nICHARG = 11").includes("hybrid-icharg11"));
ok("hybrid + VeryFast is an error", ids("ENCUT = 520\nLHFCALC = .TRUE.\nALGO = VeryFast").includes("hybrid-veryfast"));
ok("tetrahedron in a relaxation warns", ids("ENCUT = 520\nISMEAR = -5\nIBRION = 2\nNSW = 10").includes("tet-forces"));
ok("NPAR with NCORE warns", ids("ENCUT = 520\nNPAR = 4\nNCORE = 4").includes("npar-ncore"));
ok("METAGGA without LASPH warns", ids("ENCUT = 520\nMETAGGA = R2SCAN").includes("metagga-lasph"));
ok("MAGMOM without ISPIN warns", ids("ENCUT = 520\nMAGMOM = 2*3").includes("magmom-no-spin"));
ok("missing ENCUT warns", ids("ISMEAR = 0").includes("encut-missing"));
ok("ALGO = All without ISEARCH gets the note", ids("ENCUT = 520\nALGO = All").includes("algo-all-isearch"));
ok("GW/RPA ALGO values do not get the ISEARCH note", !ids("ENCUT = 520\nALGO = ACFDT").includes("algo-all-isearch") && !ids("ENCUT = 520\nALGO = CHI").includes("algo-all-isearch"));
ok("duplicate tag warns", ids("ENCUT = 520\nENCUT = 400").includes("duplicate"));
ok("unknown tag is flagged", lintIncar("ENCUT = 520\nISMAER = 0", known).some(x => x.id === "unlisted" && x.tag === "ISMAER"));
ok("a clean static INCAR has no errors or warnings",
  lintIncar("ENCUT = 520\nISMEAR = 0 ; SIGMA = 0.05\nEDIFF = 1E-6\nNSW = 0\nIBRION = -1", known).every(x => x.level === "info"));

// ---- builder: every combination ----
let combos = 0;
for (const o of allBuilderCombos()) {
  combos++;
  const r = buildIncar({ ...o, enmax: 400, magmom: o.spin === "none" ? "" : "2*3.0" });
  const text = incarText(r);
  const tags = Object.fromEntries(parseIncar(text).map(e => [e.tag, e.value]));
  const tag = JSON.stringify(o);
  const bad = lintIncar(text, known).filter(x => x.level === "error" || x.id === "unlisted");
  ok(`builder ${tag}: no errors, no unknown tags`, bad.length === 0, bad.map(x => x.message).join(" | "));
  ok(`builder ${tag}: ASCII`, !/[^\x00-\x7f]/.test(text));
  ok(`builder ${tag}: ENCUT = ceil10(1.3 x ENMAX)`, tags.ENCUT === "520");
  const relax = o.task.startsWith("relax");
  if (relax) ok(`builder ${tag}: relaxation sets IBRION, NSW, negative EDIFFG`, tags.IBRION === "2" && +tags.NSW > 0 && +tags.EDIFFG < 0);
  if (o.task === "relax-cell") ok(`builder ${tag}: ISIF = 3`, tags.ISIF === "3");
  if (relax && o.material === "metal") ok(`builder ${tag}: metal relax uses Methfessel-Paxton`, tags.ISMEAR === "1");
  if (o.material === "insulator") ok(`builder ${tag}: never ISMEAR > 0 for insulators`, !(+tags.ISMEAR > 0));
  if (o.xc === "hse06" || o.xc === "r2scan") ok(`builder ${tag}: hybrids and meta-GGAs never ICHARG = 11`, tags.ICHARG !== "11");
  if (o.xc === "r2scan" || o.xc === "hse06" || o.elements !== "sp") ok(`builder ${tag}: LASPH`, tags.LASPH === ".TRUE.");
  if (o.elements !== "sp") ok(`builder ${tag}: LMAXMIX`, tags.LMAXMIX === (o.elements === "f" ? "6" : "4"));
  if (o.spin !== "none") ok(`builder ${tag}: ISPIN = 2 with MAGMOM`, tags.ISPIN === "2" && tags.MAGMOM === "2*3.0");
}
console.log(`builder: ${combos} combinations checked`);

// ---- tag registry ----
for (const [name, t] of Object.entries(terms.tags)) {
  for (const f of ["short", "use", "pitfall"]) if (t[f]) ok(`registry ${name}.${f}: no raw < or &`, !/[<&]/.test(t[f]), t[f]);
  ok(`registry ${name}: wiki link`, /^https:\/\/www\.vasp\.at\/wiki\//.test(t.wiki || ""), t.wiki);
}

// ---- published sheets ----
const strip = s => s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
for (const s of cheats.sheets.filter(s => s.status === "published")) {
  const html = readFileSync(join(ROOT, "dft", cheats.dir, s.slug, "index.html"), "utf8");
  const blocks = [...html.matchAll(/<figure class="code (incar|sh)"><figcaption><span class="code-t">([^<]*)<\/span><\/figcaption><pre><code>([\s\S]*?)<\/code><\/pre><\/figure>/g)]
    .map(([, kind, title, code]) => ({ kind, title: strip(title), text: strip(code) }));
  ok(`${s.slug}: has code blocks`, blocks.length > 0);
  for (const b of blocks.filter(b => b.kind === "incar")) {
    const bad = lintIncar(b.text, known).filter(x => x.level === "error" || x.id === "unlisted");
    ok(`${s.slug} "${b.title}": no errors or unknown tags`, bad.length === 0, bad.map(x => x.message).join(" | "));
  }
  ok(`${s.slug}: description <= 160 characters`, s.description.length <= 160, String(s.description.length));
  ok(`${s.slug}: title <= 60 characters`, s.title.length <= 60, String(s.title.length));
  if (s.slug === "incar-tags") {
    // every tag that has a group appears in a table on the INCAR sheet
    for (const [name, t] of Object.entries(terms.tags))
      if (t.group) ok(`incar-tags: ${name} has a table row`, html.includes(`<tr id="tag-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}">`));
    s._blocks = blocks;
  }
}
ok("hub: description <= 160 characters", cheats.hub.description.length <= 160, String(cheats.hub.description.length));

// ---- shell commands on real output files ----
const FIX = join(ROOT, "dft/_research/testfiles");
if (!existsSync(FIX)) {
  console.log("skip  shell commands: dft/_research/testfiles not present");
} else {
  const incar = cheats.sheets.find(s => s.slug === "incar-tags")._blocks;
  const commands = title => incar.find(b => b.title === title).text.split("\n").map(l => l.trim()).filter(l => l && !l.startsWith("#"));
  const run = (dir, cmd) => execSync(cmd, { cwd: dir, shell: "/bin/bash", encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const outcars = ["outputs_OUTCAR_vasp_6.3", "outputs_OUTCAR.vasp.6.2.0", "fixtures_scan_relaxation_OUTCAR", "fixtures_static_silicon_OUTCAR", "outputs_OUTCAR.Al"];
  const [echo, used, xml] = commands("What VASP understood");
  const [entropy, efermi] = commands("Check the smearing in a finished run");
  for (const f of outcars) {
    const dir = mkdtempSync(join(tmpdir(), "cheat-"));
    symlinkSync(join(FIX, f), join(dir, "OUTCAR"));
    symlinkSync(join(FIX, "outputs_vasprun.xml"), join(dir, "vasprun.xml"));
    const version = run(dir, "head -1 OUTCAR").trim().split(/\s+/)[0];
    const [maj, min] = version.replace("vasp.", "").split(".").map(Number);
    const v6 = maj > 6 || (maj === 6 && min >= 2);   // the INCAR echo exists from VASP 6.2
    const e = run(dir, echo);
    if (v6) ok(`${f} (${version}): INCAR echo lists ENCUT`, /^\s+ENCUT = /m.test(e) && !/POTCAR/.test(e), e.slice(0, 120));
    else ok(`${f} (${version}): INCAR echo prints nothing on older versions`, e.trim() === "", e.slice(0, 120));
    const u = run(dir, used).trim().split("\n");
    ok(`${f} (${version}): values-used command prints 9 lines`, u.length === 9, String(u.length));
    // the ENCUT the run used equals the INCAR value (VASP 6 echo)
    const used_encut = parseFloat((u.find(l => /^\s+ENCUT/.test(l)) || "").split("=")[1]);
    if (v6) ok(`${f}: ENCUT echo and value used agree`, Math.abs(used_encut - parseFloat(e.match(/ENCUT = ([\d.]+)/)[1])) < 1e-6);
    ok(`${f}: entropy command finds EENTRO`, /EENTRO =/.test(run(dir, entropy)));
    ok(`${f}: E-fermi command finds the Fermi energy`, /E-fermi :/.test(run(dir, efermi)));
    const x = run(dir, xml).trim().split("\n");
    ok(`${f}: vasprun.xml command finds the INCAR and the values used`, x.length >= 5 && /name="ENCUT"/.test(x[0]) && x.some(l => /name="ENMAX"/.test(l)));
    rmSync(dir, { recursive: true });
  }
}

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log("All cheat-sheet checks passed.");
