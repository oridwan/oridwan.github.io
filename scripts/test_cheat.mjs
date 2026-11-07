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
import { parseIncar, lintIncar, expandValues, compressValues, buildIncar, incarText, allBuilderCombos, parsePoscar, parseKpoints, meshFromKspacing, meshFromLength, cellShape, potcarPlan, RECOMMENDED_PBE64, slurmScript, parallelTags, magmomSigns, magmomLine } from "../dft/cheat-tools.js";

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
  ok(`registry ${name}: wiki link`, /^https:\/\/www\.vasp\.at\/wiki\//.test(t.wiki || "") || (t.vtst && /^https:\/\/theory\.cm\.utexas\.edu\/vtsttools\//.test(t.wiki)), t.wiki);
}

// ---- published sheets ----
const strip = s => s.replace(/<[^>]+>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&");
const allHtml = [];
const allSh = [];
for (const s of cheats.sheets.filter(s => s.status === "published")) {
  const html = readFileSync(join(ROOT, "dft", cheats.dir, s.slug, "index.html"), "utf8");
  allHtml.push(html);
  const blocks = [...html.matchAll(/<figure class="code (incar|sh|poscar|kpoints|file)"><figcaption><span class="code-t">([^<]*)<\/span><\/figcaption><pre><code>([\s\S]*?)<\/code><\/pre><\/figure>/g)]
    .map(([, kind, title, code]) => ({ kind, title: strip(title), text: strip(code), sheet: s.slug }));
  ok(`${s.slug}: has code blocks`, blocks.length > 0);
  for (const b of blocks.filter(b => b.kind === "incar")) {
    const bad = lintIncar(b.text, known).filter(x => x.level === "error" || x.id === "unlisted");
    ok(`${s.slug} "${b.title}": no errors or unknown tags`, bad.length === 0, bad.map(x => x.message).join(" | "));
  }
  for (const b of blocks.filter(b => b.kind === "poscar")) {
    const p = parsePoscar(b.text);
    ok(`${s.slug} "${b.title}": POSCAR parses`, p.errors.length === 0 && p.natoms > 0, p.errors.join(" "));
  }
  for (const b of blocks.filter(b => b.kind === "kpoints")) {
    const k = parseKpoints(b.text);
    ok(`${s.slug} "${b.title}": KPOINTS parses`, k.errors.length === 0 && !!k.mode, k.errors.join(" "));
  }
  allSh.push(...blocks.filter(b => b.kind === "sh"));
  ok(`${s.slug}: description <= 160 characters`, s.description.length <= 160, String(s.description.length));
  ok(`${s.slug}: title <= 60 characters`, s.title.length <= 60, String(s.title.length));
  if (s.slug === "incar-tags") s._blocks = blocks;
}
// every tag that has a group appears in a table on some published sheet
for (const [name, t] of Object.entries(terms.tags))
  if (t.group) ok(`${name} has a table row on a sheet`, allHtml.some(h => h.includes(`<tr id="tag-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}">`)));
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
  // every command on every sheet that reads only OUTCAR, OSZICAR or vasprun.xml (or vasp.out) runs on each
  // real file without a shell or syntax error, and finds something in at least one of them
  const other = /(^|\s)(POSCAR|POTCAR|IBZKPT|CONTCAR|DOSCAR|EIGENVAL|PROCAR|XDATCAR|CHGCAR|WAVECAR|KPOINTS|INCAR)(\s|$)|vasp_|squeue|sbatch|sacct|scontrol|seff|srun|mpirun|\.\.\/|(^|\s)cp\s|\$\{|\$[A-Z]/;
  const joined = allSh.flatMap(b => {
    const out = []; let cur = "";
    for (const l of b.text.split("\n")) {            // join awk continuation lines into one command
      const t = l.replace(/\s+#.*$/, "").trim();
      if (!t || t.startsWith("#")) continue;
      cur = cur ? cur + " " + t : t;
      if ((cur.match(/'/g) || []).length % 2 === 0 && !cur.endsWith("\\")) { out.push({ sheet: b.sheet, title: b.title, cmd: cur }); cur = ""; }
    }
    return out;
  });
  const cmds = joined.filter(c => /OUTCAR|OSZICAR|vasprun\.xml/.test(c.cmd) && !other.test(c.cmd));
  const allOutcars = [...outcars, "fixtures_fe_monomer_OUTCAR", "fixtures_relaxation_OUTCAR", "outputs_OUTCAR.stopped", "outputs_OUTCAR.NiO_SOC"];
  const found = new Map(cmds.map(c => [c.cmd, false]));
  for (const f of allOutcars) {
    const dir = mkdtempSync(join(tmpdir(), "cheat-"));
    symlinkSync(join(FIX, f), join(dir, "OUTCAR"));
    symlinkSync(join(FIX, "outputs_vasprun.xml"), join(dir, "vasprun.xml"));
    symlinkSync(join(FIX, f.includes("silicon") ? "fixtures_static_silicon_OSZICAR" : "outputs_OSZICAR"), join(dir, "OSZICAR"));
    execSync(": > vasp.out", { cwd: dir, shell: "/bin/bash" });
    for (const c of cmds) {
      try {
        const o = run(dir, c.cmd);
        if (o.trim() && !/^0$/.test(o.trim())) found.set(c.cmd, true);
      } catch (e) {
        // grep exits 1 when nothing matches; anything else is a real failure
        if (e.status !== 1) ok(`${c.sheet} "${c.title}" on ${f}: ${c.cmd}`, false, String(e.stderr || e.message).slice(0, 160));
      }
    }
    rmSync(dir, { recursive: true });
  }
  for (const c of cmds) ok(`${c.sheet} "${c.title}": finds something in at least one real OUTCAR: ${c.cmd}`, found.get(c.cmd) || /gap|"T="/.test(c.cmd));   // no 6.4.3+ OUTCAR and no MD OSZICAR among the test files
  console.log(`shell: ${cmds.length} commands run on ${allOutcars.length} OUTCARs`);
}

// ---- POSCAR parser and k-mesh rules ----
const bn = parsePoscar("Cubic BN\n3.57\n0.0 0.5 0.5\n0.5 0.0 0.5\n0.5 0.5 0.0\nB N\n1 1\nDirect\n0.00 0.00 0.00\n0.25 0.25 0.25\n");
ok("POSCAR: cubic BN volume = a^3/4", Math.abs(bn.volume - 3.57 ** 3 / 4) < 1e-9);
ok("POSCAR: B-N distance = a*sqrt(3)/4", Math.abs(bn.minDist - 3.57 * Math.sqrt(3) / 4) < 1e-9);
ok("POSCAR: primitive fcc recognised", bn.shape === "fcc");
ok("KSPACING 0.25 on fcc a = 3.57: N = ceil(2*pi*sqrt(3)/3.57/0.25) = 13", meshFromKspacing(bn.lattice, 0.25).join() === "13,13,13");
const si = parsePoscar("Si\n1.0\n5.43 0 0\n0 5.43 0\n0 0 5.43\nSi\n1\nDirect\n0 0 0\n");
ok("KSPACING 0.25 on cubic a = 5.43: N = 5", meshFromKspacing(si.lattice, 0.25).join() === "5,5,5");
ok("Auto R_k = 20 on cubic a = 5.43: N = int(20/5.43 + 0.5) = 4", meshFromLength(si.lattice, 20).join() === "4,4,4");
const vol = parsePoscar("x\n-40\n1 0 0\n0 1 0\n0 0 1\nSi\n1\nDirect\n0 0 0\n");
ok("POSCAR: negative scale sets the volume", Math.abs(vol.volume - 40) < 1e-9);
const three = parsePoscar("x\n1.0 1.0 1.02\n4 0 0\n0 4 0\n0 0 4\nSi\n1\nDirect\n0 0 0\n");
ok("POSCAR: three scaling factors scale x, y, z", Math.abs(three.params.c - 4.08) < 1e-9 && Math.abs(three.params.a - 4) < 1e-9);
const hex = parsePoscar("hex\n1.0\n2.5 0 0\n-1.25 2.1650635 0\n0 0 4\nC\n1\nDirect\n0 0 0\n");
ok("POSCAR: hexagonal cell recognised", hex.shape === "hexagonal");
ok("POSCAR: count mismatch is an error", parsePoscar("x\n1\n1 0 0\n0 1 0\n0 0 1\nSi\n2\nDirect\n0 0 0\n").errors.length > 0);
ok("POSCAR: 0.3333 flagged as too few digits", parsePoscar("x\n1\n3 0 0\n0 3 0\n0 0 3\nSi\n1\nDirect\n0.3333 0 0\n").warnings.some(w => /digits/.test(w)));
ok("POSCAR: long species names flagged", parsePoscar("x\n1\n3 0 0\n0 3 0\n0 0 3\nNd1 Nd2\n1 1\nDirect\n0 0 0\n0.5 0.5 0.5\n").warnings.some(w => /2 characters/.test(w)));
ok("POSCAR: Cartesian positions are scaled", Math.abs(parsePoscar("x\n2.0\n1 0 0\n0 1 0\n0 0 1\nH\n2\nCartesian\n0 0 0\n0.5 0 0\n").minDist - 1.0) < 1e-9);

// ---- POTCAR planner (VASP recommended list, potpaw.64 PBE, valid since October 2026) ----
ok("recommended list has 96 elements", Object.keys(RECOMMENDED_PBE64).length === 96);
ok("October 2026 changes: Fe_pv Co_pv Ni_pv Cu_pv Eu_3 Yb_3", ["Fe_pv", "Co_pv", "Ni_pv", "Cu_pv", "Eu_3", "Yb_3"].every((p, i) => RECOMMENDED_PBE64[["Fe", "Co", "Ni", "Cu", "Eu", "Yb"][i]][0] === p));
const nfb = potcarPlan("Nd Fe B", "2 14 1");
ok("Nd2Fe14B: Nd_3 Fe_pv B", nfb.rows.map(r => r.pot).join() === "Nd_3,Fe_pv,B");
ok("Nd2Fe14B: valence electrons 2*11 + 14*14 + 3 = 221", nfb.nelect === 221);
ok("Nd2Fe14B: default ENCUT = ENMAX of B (318.614)", nfb.maxEnmax === 318.614 && nfb.encut13 === 420);
ok("override keeps the name and drops unknown ENMAX", potcarPlan("Fe_sv O").rows[0].pot === "Fe_sv" && potcarPlan("Fe_sv O").maxEnmax === null);
ok("unknown symbol flagged", !potcarPlan("Xx").rows[0].known);

// ---- Slurm generator and the scripts on the pages ----
const bashN = text => { try { execSync("bash -n", { input: text, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }); return ""; } catch (e) { return String(e.stderr); } };
let nScripts = 0;
for (const nodes of [1, 2]) for (const rpn of [4, 64, 128]) for (const thr of [1, 4]) for (const gpn of [0, 4]) for (const kpts of [0, 10, 37]) for (const sig of [0, 15]) {
  const r = slurmScript({ nodes, ranksPerNode: rpn, threads: thr, gpusPerNode: gpn, kpts, signalMinutes: sig, exe: "vasp_std", time: "24:00:00", name: "t" });
  nScripts++;
  const e = bashN(r.script);
  if (e) ok(`slurm script bash -n (${nodes}x${rpn}x${thr}, gpu ${gpn})`, false, e);
  const t = parallelTags({ nodes, ranksPerNode: rpn, threads: thr, gpusPerNode: gpn, kpts });
  if (t.total % t.kpar) ok("KPAR divides the ranks", false, `${t.total} / ${t.kpar}`);
  if (kpts && kpts % t.kpar) ok("KPAR divides the irreducible k-points", false);
  if (t.ncore && (rpn % t.ncore || (t.total / t.kpar) % t.ncore)) ok("NCORE divides ranks per node and per group", false);
  if ((gpn || thr > 1) && t.ncore) ok("no NCORE with GPUs or threads", false);
  if (gpn && rpn !== gpn && !r.errors.length) ok("GPU rank mismatch flagged", false);
}
ok(`slurm generator: ${nScripts} layouts pass bash -n and the tag rules`, true);
ok("128 ranks, 10 k-points: KPAR 2 (divides both), NCORE 8", (t => t.kpar === 2 && t.ncore === 8)(parallelTags({ nodes: 2, ranksPerNode: 64, kpts: 10 })));
ok("4 GPUs, 8 k-points: KPAR 4", parallelTags({ nodes: 1, ranksPerNode: 4, gpusPerNode: 4, kpts: 8 }).kpar === 4);
for (const b of allSh.filter(b => b.text.startsWith("#!/bin/bash"))) ok(`${b.sheet} "${b.title}": bash -n`, !bashN(b.text), bashN(b.text));

// ---- error lookup: pasting a card's own message finds it ----
const errHtml = readFileSync(join(ROOT, "dft", cheats.dir, "errors-and-fixes", "index.html"), "utf8");
for (const [, id, keys, h3] of errHtml.matchAll(/<article class="err-card" id="([^"]+)" data-keys="([^"]+)">\s*<h3>([\s\S]*?)<\/h3>/g)) {
  const msg = strip(h3).toLowerCase();
  ok(`error card ${id}: its message matches one of its keys`, keys.split("|").some(k => msg.includes(k)), msg);
}

// ---- MAGMOM builder ----
const bccFe = parsePoscar("bcc Fe\n1.0\n2.87 0 0\n0 2.87 0\n0 0 2.87\nFe\n2\nDirect\n0 0 0\n0.5 0.5 0.5\n");
ok("MAGMOM: bcc Fe layers along c = 3.0 -3.0", magmomLine(bccFe, { Fe: 3 }, magmomSigns(bccFe, { Fe: 3 }, "layers-c")).line === "3.0 -3.0");
ok("MAGMOM: ferromagnetic compresses", magmomLine(bccFe, { Fe: 3 }, magmomSigns(bccFe, { Fe: 3 }, "fm")).line === "2*3.0");
ok("MAGMOM: noncollinear gives 3 numbers per atom", magmomLine(bccFe, { Fe: 3 }, [1, 1], true).count === 6);
const nio = parsePoscar("x\n1\n3 0 0\n0 3 0\n0 0 8\nNi O\n2 2\nDirect\n0 0 0\n0.5 0.5 0.5\n0.5 0.5 0\n0 0 0.5\n");
const nl = magmomLine(nio, { Ni: 2, O: 0 }, magmomSigns(nio, { Ni: 2, O: 0 }, "layers-c"));
ok("MAGMOM: zero-moment species stay 0 and the count matches", nl.line === "2.0 -2.0 2*0.0" && nl.count === 4 && nl.total === 0);
ok("MAGMOM line round-trips through the parser", expandValues(nl.line).length === nio.natoms);
const noisy = parsePoscar("x\n1\n3 0 0\n0 3 0\n0 0 12\nFe\n4\nDirect\n0 0 0.2500\n0.5 0.5 0.2502\n0 0 0.7500\n0.5 0.5 0.7498\n");
const ns = magmomSigns(noisy, { Fe: 3 }, "layers-c");
ok("MAGMOM layers: 0.2500/0.2502 one plane, 0.7500/0.7498 the other, opposite signs", ns[0] === ns[1] && ns[2] === ns[3] && ns[0] === -ns[2] && ns.planes === 2);
const wrap = parsePoscar("x\n1\n3 0 0\n0 3 0\n0 0 12\nFe\n2\nDirect\n0 0 0.0\n0.5 0.5 0.9999\n");
ok("MAGMOM layers: 0.9999 and 0.0 are the same plane", magmomSigns(wrap, { Fe: 3 }, "layers-c").planes === 1);

console.log(`${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
console.log("All cheat-sheet checks passed.");
