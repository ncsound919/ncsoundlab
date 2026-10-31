#!/usr/bin/env node
/**
 * Ecosystem operability audit.
 *
 * Answers one question per tool: *can I actually run this, alone, from my phone,
 * and prove it works?* Not "can I publish it".
 *
 * It measures what can be measured from source and is explicit about what it
 * cannot:
 *
 *   stubs         every place a control is empty, disabled or throws
 *   test depth    % of modules that have any test at all, and test:source ratio
 *   provability   a changelog, an audit record, evidence artifacts, a recipe
 *   handoff       exports/imports/deep links/contracts that connect it to the next tool
 *   phone         whether the surface can be driven on a phone at all
 *   visibility    health/crash/telemetry hooks so failures are visible
 *
 * Usage:
 *   node scripts/ecosystem-audit.mjs                 # table
 *   node scripts/ecosystem-audit.mjs --json          # JSON to stdout
 *   node scripts/ecosystem-audit.mjs --only=field,sieve
 *   node scripts/ecosystem-audit.mjs --export=audit.json
 *   node scripts/ecosystem-audit.mjs --verbose       # per-tool findings
 *
 * Exit: 0 always (it is a report), 2 if the tool list cannot be read.
 * Node 20+, no dependencies — same constraint as wiring/.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CONFIG = path.join(HERE, 'ecosystem-tools.json');

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.gradle', '.venv', 'venv', '__pycache__', 'dist',
  'build', 'out', 'target', '.next', '.turbo', 'coverage', 'test-results',
  'playwright-report', 'Pods', '.idea', '.cache', 'third_party', 'unsloth_compiled_cache',
  '.expo', 'android/app/build', 'output', 'output2', 'output_v2', 'output_v3',
  // Wrangler writes bundled Workers here; they are build output, not source.
  '.wrangler', '.pytest_cache',
]);

const SRC_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.kt', '.kts', '.java',
  '.swift', '.py', '.cpp', '.cc', '.hpp', '.h', '.c', '.rs',
]);

const MAX_FILES = 12000;

// Tightened on the first real run. The loose version flagged four benign
// comments in Field — "no-op before the constructor wires the nodes",
// "scrollIntoView is not implemented in jsdom", "no-op when already open",
// "C = no-op" — and would have put a false number in the report. A stub is a
// control that does nothing *for the user*; idempotency prose is not a stub.
const STUB_PATTERNS = [
  { re: /\bTODO\(\)/, kind: 'throws', why: 'Kotlin TODO() — throws NotImplementedError at runtime' },
  { re: /raise\s+NotImplementedError/, kind: 'throws', why: 'Python NotImplementedError' },
  { re: /throw\s+new\s+Error\(\s*['"`]not implemented/i, kind: 'throws', why: 'throws "not implemented"' },
  { re: /\bnot yet implemented\b/i, kind: 'throws', why: 'claims not yet implemented' },
  { re: /\bunimplemented\b/i, kind: 'throws', why: 'claims unimplemented' },
  { re: /onClick=\{\(\)\s*=>\s*\{\s*\}\}/, kind: 'empty-handler', why: 'React onClick with an empty body' },
  { re: /onClick=\{\(\)\s*=>\s*null\s*\}/, kind: 'empty-handler', why: 'React onClick returning null' },
  { re: /onPress=\{\(\)\s*=>\s*\{\s*\}\}/, kind: 'empty-handler', why: 'React Native onPress with an empty body' },
  { re: /\bon[A-Z]\w+\s*=\s*\{\s*\{\s*\}\s*\}/, kind: 'empty-handler', why: 'JSX handler with an empty object' },
  { re: /\bcoming soon\b/i, kind: 'placeholder', why: 'user-visible "coming soon"' },
  { re: /(?:^|\s)\/\/\s*(?:TODO|FIXME|HACK|XXX)\b/, kind: 'marker', why: 'TODO/FIXME/HACK comment' },
  { re: /(?:^|\s)#\s*(?:TODO|FIXME|HACK|XXX)\b/, kind: 'marker', why: 'TODO/FIXME/HACK comment' },
  { re: /(?:^|\s)\*\s*(?:TODO|FIXME|HACK|XXX)\b/, kind: 'marker', why: 'TODO/FIXME/HACK comment' },
];

// Files that contain the patterns above as data, not as code.
const IGNORE_STUB_FILES = [/ecosystem-audit\.mjs$/];

const PROVABILITY_ARTIFACTS = [
  { file: 'CHANGELOG.md', weight: 4, label: 'changelog' },
  { file: 'AUDIT.md', weight: 4, label: 'audit record' },
  { file: 'RESULT.md', weight: 3, label: 'result/metrics record' },
  { file: 'README.md', weight: 2, label: 'README' },
  { file: 'SECURITY.md', weight: 1, label: 'security policy' },
  { file: 'docs/DEPLOY-READINESS.md', weight: 3, label: 'readiness checklist' },
  { file: 'LICENSE', weight: 3, label: 'license' },
];

function norm(p) {
  return p.replace(/\\/g, '/');
}

function walk(root, budget) {
  const files = [];
  const stack = [root];

  while (stack.length && files.length < budget) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      const rel = norm(path.relative(root, full));
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        if (rel.split('/').length > 8) continue;
        stack.push(full);
      } else if (entry.isFile()) {
        files.push({ full, rel, name: entry.name, ext: path.extname(entry.name).toLowerCase() });
        if (files.length >= budget) break;
      }
    }
  }
  return files;
}

function isTestFile(rel) {
  const base = path.basename(rel);
  if (/\.(test|spec)\.[a-z]+$/i.test(base)) return true;
  if (/Tests?\.(kt|swift|java)$/.test(base)) return true;
  if (/_test\.(py|go)$/i.test(base)) return true;
  // pytest's other convention: tests/test_foo.py and foo/test_foo.py. Without
  // this, a test file is counted as an untested source module (wiring/modal).
  if (/^test_.*\.py$/i.test(base)) return true;
  if (/(^|\/)(__tests__|androidTest|test|tests)\//i.test(rel) && /\.(kt|ts|tsx|js|py|java)$/i.test(base)) return true;
  // Native host suites: `tests/tests.cpp`, `tests/test_mixer.cpp`, `foo_test.cpp`.
  // Phone Beat runs these under ASan/TSan via tests/run_audit.sh; treating them
  // as untested sources made its coverage look half of what it is.
  if (/(^|\/)(tests?|__tests__)\//i.test(rel) && /\.(cpp|cc|cxx|c|h|hpp)$/i.test(base)) return true;
  if (/_test\.(cpp|cc|cxx)$/i.test(base)) return true;
  return false;
}

function isSourceFile(rel, ext) {
  if (!SRC_EXT.has(ext)) return false;
  if (/\.d\.ts$/.test(rel)) return false;
  if (/\.min\.(js|css)$/.test(rel)) return false;
  if (/\/dist\/|\/build\/|\/generated\//.test(rel)) return false;
  // Config is declarative, not behaviour: testing it is not a coverage signal.
  if (/\.config\.(ts|js|mjs|cjs)$/.test(rel)) return false;
  // Gradle build scripts configure a module; they are not module behaviour.
  if (/(^|\/)(build|settings)\.gradle(\.kts)?$/.test(rel)) return false;
  return true;
}

function countLoc(text) {
  let loc = 0;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    if (t.startsWith('//') || t.startsWith('#') || t.startsWith('*') || t.startsWith('/*')) continue;
    loc += 1;
  }
  return loc;
}

/**
 * A "test key" collapses every convention in this ecosystem to one string:
 * the package/dir path plus the module name, with markers and suffixes removed.
 *
 *   src/components/__tests__/Foo.test.tsx  → src/components/Foo
 *   app/src/main/java/com/x/Foo.kt        → app/java/com/x/Foo
 *   app/src/test/java/com/x/FooTest.kt    → app/java/com/x/Foo
 *   src/lib/foo.test.ts                   → src/lib/foo
 *   tests/test_foo.py                     → tests/foo
 *
 * Kotlin and Swift put tests in a parallel tree (src/test vs src/main), so a
 * sibling lookup alone reports 0% coverage for a well-tested Android app. That
 * was wrong on the first run and is the reason this exists.
 */
function testKey(rel) {
  const withoutExt = rel.replace(/\.[^./]+$/, '');
  const dir = path.posix.dirname(withoutExt);
  let base = path.posix.basename(withoutExt);

  base = base
    .replace(/[._](test|spec)$/i, '')
    .replace(/(Tests|Test|Spec|InstrumentedTest)$/i, '')
    .replace(/^test_/i, '');

  const collapsedDir = dir
    .split('/')
    .filter((segment) => !['__tests__', 'tests', 'test', 'androidTest', 'main'].includes(segment))
    .join('/');

  return `${collapsedDir}/${base}`;
}

/**
 * Two rules, because one rule lies on one platform:
 *
 *  1. exact   — a test key equals the module key (the TS/JS/Python convention)
 *  2. package — a test exists in the same package at most two levels up
 *
 * Rule 2 exists for Kotlin, where tests are named by feature
 * (`AgentRepositoryFullTest`) rather than after a class, and live in a parallel
 * `src/test` tree. Without it a well-tested Android app reports 0%, which is a
 * measurement artifact, not a finding.
 *
 * Two levels is deliberate: it captures "tests live in the package root"
 * without letting one test file mark an entire app as covered.
 */
function moduleCoverageOf(sources, tests) {
  const keys = tests.map((t) => testKey(t.rel));
  const exact = new Set(keys);

  // Only a *parallel test tree* earns the package fallback. A single test file
  // sitting next to sources (the TS convention) must not mark a whole folder as
  // covered — that inflated the first run of this metric on the Expo apps.
  const parallelTree = /(^|\/)src\/(test|androidTest|iosTest)\//i;
  const packageDirs = new Set(
    tests
      .filter((t) => parallelTree.test(t.rel))
      .map((t) => testKey(t.rel))
      .map((k) => k.slice(0, k.lastIndexOf('/'))),
  );

  let tested = 0;
  let exactHits = 0;
  let untestedCount = 0;
  const untested = [];

  for (const module of sources) {
    const key = testKey(module.rel);
    if (exact.has(key)) {
      tested += 1;
      exactHits += 1;
      continue;
    }
    let dir = key.slice(0, key.lastIndexOf('/'));
    let covered = false;
    // level 0 = the module's own package, then up to two levels above it.
    for (let level = 0; level <= 2 && dir; level += 1) {
      if (packageDirs.has(dir)) {
        covered = true;
        break;
      }
      const cut = dir.lastIndexOf('/');
      if (cut < 0) break;
      dir = dir.slice(0, cut);
    }
    if (covered) tested += 1;
    else {
      untestedCount += 1;
      if (untested.length < 80) untested.push(module.rel);
    }
  }

  return {
    tested,
    exactHits,
    untested,
    untestedCount,
    coverage: sources.length ? tested / sources.length : 0,
  };
}

function readIfExists(file, max = 200_000) {
  try {
    const stat = fs.statSync(file);
    if (stat.size > max) return null;
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function scanStubs(root, sources) {
  const findings = [];
  let total = 0;

  for (const file of sources) {
    if (IGNORE_STUB_FILES.some((re) => re.test(file.rel))) continue;
    const text = readIfExists(file.full);
    if (!text) continue;
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i];
      // Cheap pre-filter so 12k lines of code do not run 13 regexes each.
      if (!/TODO|FIXME|HACK|XXX|not implemented|coming soon|no-op|noop|onClick|onPress|on[A-Z]\w+=/.test(line)) {
        continue;
      }
      for (const pattern of STUB_PATTERNS) {
        if (pattern.re.test(line)) {
          total += 1;
          if (findings.length < 400) {
            findings.push({
              file: file.rel,
              line: i + 1,
              kind: pattern.kind,
              why: pattern.why,
              text: line.trim().slice(0, 140),
            });
          }
          break;
        }
      }
    }
  }
  return { total, findings };
}

function scoreProvability(root) {
  const present = [];
  let score = 0;

  for (const artifact of PROVABILITY_ARTIFACTS) {
    if (fs.existsSync(path.join(root, artifact.file))) {
      score += artifact.weight;
      present.push(artifact.label);
    }
  }

  // Evidence directories and hash manifests are the real proof, not the prose.
  const evidenceDirs = ['audits', 'evidence', 'docs/audit', 'reports', 'lens-readouts'];
  const foundEvidence = evidenceDirs.filter((d) => fs.existsSync(path.join(root, d)));
  if (foundEvidence.length) {
    score += 3;
    present.push(`evidence dir (${foundEvidence.join(', ')})`);
  }

  let hashes = 0;
  const stack = [root];
  let scanned = 0;
  while (stack.length && scanned < 4000) {
    const dir = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      scanned += 1;
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue;
        stack.push(path.join(dir, entry.name));
      } else if (/\.(sha256|sha1|md5)$/i.test(entry.name) || /SHA256SUMS/i.test(entry.name)) {
        hashes += 1;
      }
    }
  }
  if (hashes) {
    score += 2;
    present.push(`${hashes} hash manifest(s)`);
  }

  return { score: Math.min(20, score), present };
}

function scoreHandoff(root, sources) {
  const hits = [];
  const needles = [
    ['.ncbeat', 'export .ncbeat'],
    ['aaf', 'AAF export/import'],
    ['deeplink', 'deep links'],
    ['deep link', 'deep links'],
    ['openapi', 'API contract'],
    ['registry.json', 'registry entry'],
    ['import ', 'import path'],
  ];
  const corpus = sources.slice(0, 400);
  for (const [needle, label] of needles) {
    const lower = needle.toLowerCase();
    let found = false;
    for (const file of corpus) {
      const text = readIfExists(file.full, 60_000);
      if (text && text.toLowerCase().includes(lower)) {
        found = true;
        break;
      }
    }
    if (found) hits.push(label);
  }
  const unique = [...new Set(hits)];
  return { score: Math.min(15, unique.length * 4), present: unique };
}

/** Version, from whichever manifest the tool actually uses. */
function readVersion(root) {
  const pkg = readIfExists(path.join(root, 'package.json'), 40_000);
  if (pkg) {
    try {
      const parsed = JSON.parse(pkg);
      if (parsed.version) return `v${parsed.version}`;
    } catch {
      /* fall through */
    }
  }
  for (const gradle of ['app/build.gradle.kts', 'app/build.gradle']) {
    const text = readIfExists(path.join(root, gradle), 120_000);
    if (text) {
      const name = text.match(/versionName\s*=?\s*"([^"]+)"/);
      const code = text.match(/versionCode\s*=?\s*(\d+)/);
      if (name) return `v${name[1]}${code ? ` (${code[1]})` : ''}`;
    }
  }
  return 'unversioned';
}

/** First changelog heading — what this tool last claimed to change. */
function readHeadline(root) {
  const text = readIfExists(path.join(root, 'CHANGELOG.md'), 60_000);
  if (!text) return null;
  for (const line of text.split(/\r?\n/)) {
    if (/^##\s+/.test(line.trim())) return line.trim().replace(/^##\s+/, '').slice(0, 160);
  }
  return null;
}

function describeSurface(root) {
  const marks = [];
  if (fs.existsSync(path.join(root, 'app.json'))) {
    const app = readIfExists(path.join(root, 'app.json')) || '';
    if (app.includes('"expo"')) marks.push('expo (cloud-buildable)');
  }
  if (fs.existsSync(path.join(root, 'field.html'))) marks.push('separate phone entry');
  // A manifest can live at the package root or inside a workspace app
  // (`apps/web/public`). Looking only at the root under-reported PWA surfaces
  // in monorepos such as Math X.
  const manifestRoots = [root];
  let topLevel = [];
  try {
    topLevel = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    topLevel = [];
  }
  for (const entry of topLevel) {
    if (!entry.isDirectory() || SKIP_DIRS.has(entry.name)) continue;
    const dir = path.join(root, entry.name);
    manifestRoots.push(dir);
    // One more level for workspace groups (`apps/web`, `packages/ui`).
    if (entry.name === 'apps' || entry.name === 'packages') {
      let children = [];
      try {
        children = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        children = [];
      }
      for (const child of children) {
        if (child.isDirectory()) manifestRoots.push(path.join(dir, child.name));
      }
    }
  }
  if (
    manifestRoots.some(
      (dir) =>
        fs.existsSync(path.join(dir, 'public/manifest.json')) ||
        fs.existsSync(path.join(dir, 'public/manifest.webmanifest')),
    )
  ) {
    marks.push('PWA manifest');
  }
  if (fs.existsSync(path.join(root, 'app/src/main/AndroidManifest.xml'))) marks.push('android app');
  if (fs.existsSync(path.join(root, 'src-tauri'))) marks.push('desktop shell');
  if (!marks.length) marks.push('web page');
  return marks;
}

function scoreVisibility(root, sources) {
  const needles = ['telemetry', 'sieve', 'sentry', 'crash', '/health', 'analytics'];
  let found = 0;
  for (const needle of needles) {
    const hit = sources.slice(0, 400).some((f) => {
      const text = readIfExists(f.full, 60_000);
      return text && text.toLowerCase().includes(needle);
    });
    if (hit) found += 1;
  }
  return { score: Math.min(5, found), present: found };
}

function auditTool(tool) {
  const root = tool.path;
  if (!fs.existsSync(root)) {
    return { ...tool, missing: true };
  }

  const allFiles = walk(root, MAX_FILES);
  // `exclude` is an explicit, per-tool list of vendored trees. Third-party code
  // checked into a repo is not the operator's readiness debt — without this,
  // Oncology's vendored AlphaGenome TODOs read as 39 stubs of their own.
  const excludes = (tool.exclude ?? []).map((p) => p.replace(/^\/+|\/+$/g, ''));
  const files = allFiles.filter((f) => !excludes.some((ex) => f.rel === ex || f.rel.startsWith(`${ex}/`)));
  const relSet = new Set(files.map((f) => f.rel));

  const sources = [];
  const tests = [];
  let sourceLoc = 0;
  let testLoc = 0;

  for (const file of files) {
    if (isTestFile(file.rel)) {
      tests.push(file);
      const text = readIfExists(file.full, 400_000);
      if (text) testLoc += countLoc(text);
    } else if (isSourceFile(file.rel, file.ext)) {
      sources.push(file);
      const text = readIfExists(file.full, 400_000);
      if (text) sourceLoc += countLoc(text);
    }
  }

  // Module coverage: exact-match tests, with a bounded package-level fallback.
  const { tested, exactHits, untested, untestedCount, coverage: baseCoverage } =
    moduleCoverageOf(sources, tests);

  // Explicit coverage groups: a single host suite can exercise a whole native
  // tree (Phone Beat's tests/run_audit.sh links every engine/src source). Name
  // matching cannot infer that link, so a tool may record it here with the test
  // files that must exist. Only modules already counted as untested are added.
  const untestedSet = new Set(untested);
  let groupCovered = 0;
  for (const group of tool.coverageGroups ?? []) {
    const prefix = String(group.sources || '').replace(/^\/+|\/+$/g, '');
    if (!prefix) continue;
    const testsPresent = (group.tests ?? []).every((t) => relSet.has(t));
    if (!testsPresent) continue;
    for (const module of sources) {
      if (module.rel === prefix || module.rel.startsWith(`${prefix}/`)) {
        if (untestedSet.has(module.rel)) {
          groupCovered += 1;
          untestedSet.delete(module.rel);
        }
      }
    }
  }
  const moduleCoverage = sources.length
    ? (tested + groupCovered) / sources.length
    : 0;
  // Group coverage closes modules that exact-name matching could not see. The
  // verbose list must drop those too, otherwise a 100% tool still prints a
  // "no test beside" list that contradicts its own score.
  const uncovered = untested.filter((rel) => untestedSet.has(rel));
  const uncoveredCount = untestedCount - groupCovered;

  const stubs = scanStubs(root, sources);
  const stubDensity = sourceLoc ? (stubs.total / sourceLoc) * 1000 : 0;

  const provability = scoreProvability(root);
  const handoff = scoreHandoff(root, sources);
  const visibility = scoreVisibility(root, sources);
  const surface = describeSurface(root);

  const fileRatio = sources.length ? tests.length / sources.length : 0;
  const locRatio = sourceLoc ? testLoc / sourceLoc : 0;

  // --- scoring -------------------------------------------------------------
  // stubs 25 · test depth 25 · provability 20 · handoff 15 · phone 10 · visibility 5
  const stubScore = stubDensity <= 0.5
    ? 25
    : Math.max(0, 25 - ((stubDensity - 0.5) / 9.5) * 25);

  const testScore = 25 * Math.min(
    1,
    0.6 * moduleCoverage + 0.25 * Math.min(1, fileRatio / 0.35) + 0.15 * Math.min(1, locRatio / 0.45),
  );

  // Phone operability: can this be driven one-handed without a laptop?
  let phoneScore = 2;
  if (surface.some((s) => s.includes('phone entry') || s.includes('expo') || s.includes('android'))) phoneScore = 9;
  else if (surface.some((s) => s.includes('PWA'))) phoneScore = 7;

  const total = Math.round(
    stubScore + testScore + provability.score + handoff.score + phoneScore + visibility.score,
  );

  return {
    slug: tool.slug,
    name: tool.name,
    kind: tool.kind,
    version: readVersion(root),
    lastClaim: readHeadline(root),
    surfaceDeclared: tool.surface,
    surfaceDetected: surface,
    sourceFiles: sources.length,
    testFiles: tests.length,
    sourceLoc,
    testLoc,
    moduleCoverage: Number((moduleCoverage * 100).toFixed(1)),
    testedModules: tested + groupCovered,
    exactTestModules: exactHits,
    stubs: stubs.total,
    stubDensity: Number(stubDensity.toFixed(2)),
    scores: {
      stubs: Math.round(stubScore),
      tests: Math.round(testScore),
      provability: provability.score,
      handoff: handoff.score,
      phone: phoneScore,
      visibility: visibility.score,
    },
    total,
    provabilityPresent: provability.present,
    handoffPresent: handoff.present,
    stubFindings: stubs.findings.slice(0, 12),
    untestedModules: uncovered.slice(0, 10),
    uncoveredCount,
  };
}

function pad(value, width) {
  return String(value).padEnd(width);
}

function padStart(value, width) {
  return String(value).padStart(width);
}

function main() {
  const args = process.argv.slice(2);
  const flag = (name) => args.some((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  const value = (name) => {
    const hit = args.find((a) => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };

  let config;
  try {
    config = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  } catch (error) {
    console.error(`Cannot read ${CONFIG}: ${error.message}`);
    process.exit(2);
  }

  const only = value('only');
  const wanted = only ? new Set(only.split(',').map((s) => s.trim())) : null;

  const results = config.tools
    .filter((tool) => !wanted || wanted.has(tool.slug))
    .map((tool) => {
      try {
        return auditTool(tool);
      } catch (error) {
        return { ...tool, error: error.message };
      }
    });

  const report = {
    generatedAt: new Date().toISOString(),
    rubric: {
      stubs: 25,
      tests: 25,
      provability: 20,
      handoff: 15,
      phone: 10,
      visibility: 5,
      note: 'Measures operability for a solo, phone-first operator. It does not measure design quality or whether the feature is the right feature.',
    },
    tools: results,
  };

  const exportTo = value('export');
  if (exportTo) {
    fs.writeFileSync(exportTo, `${JSON.stringify(report, null, 2)}\n`);
  }

  // ---- evidence handoff ---------------------------------------------------
  // One file per tool, shaped for the marketing console to consume. Claims are
  // limited to what was measured, so generated copy can cite a number instead
  // of asserting one. This is the join between "is it ready" and "say so".
  const evidenceDir = value('evidence');
  if (evidenceDir) {
    fs.mkdirSync(evidenceDir, { recursive: true });
    for (const row of results.filter((r) => !r.missing && !r.error)) {
      const evidence = {
        schema: 'overlay.release_evidence.v1',
        generatedAt: report.generatedAt,
        slug: row.slug,
        name: row.name,
        kind: row.kind,
        version: row.version,
        lastClaim: row.lastClaim,
        operability: { score: row.total, breakdown: row.scores },
        measured: {
          sourceFiles: row.sourceFiles,
          sourceLoc: row.sourceLoc,
          testFiles: row.testFiles,
          testLoc: row.testLoc,
          modulesWithTests: row.testedModules,
          moduleCoveragePct: row.moduleCoverage,
          deadControls: row.stubs,
        },
        proven: row.provabilityPresent,
        connectsTo: row.handoffPresent,
        surfaces: row.surfaceDetected,
        // Only claims the audit can stand behind.
        safeClaims: [
          row.stubs === 0 ? 'no dead controls found by automated sweep' : null,
          row.testFiles > 0 ? `${row.testFiles} test files, ${row.moduleCoverage}% of modules exercised` : null,
          row.provabilityPresent.includes('changelog') ? 'maintains a changelog' : null,
          row.provabilityPresent.includes('license') ? 'open source' : null,
        ].filter(Boolean),
        unsafeClaims: row.stubs > 3 ? ['do not claim completeness: dead controls present'] : [],
      };
      fs.writeFileSync(
        path.join(evidenceDir, `${row.slug}.json`),
        `${JSON.stringify(evidence, null, 2)}\n`,
      );
    }
    console.log(`  evidence written to ${evidenceDir}/ (${results.length} files)`);
  }

  if (flag('json')) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    return;
  }

  const rows = results.filter((r) => !r.missing && !r.error);
  const broken = results.filter((r) => r.missing || r.error);

  console.log('');
  console.log('  Ecosystem operability audit');
  console.log('  stubs 25 · tests 25 · provability 20 · handoff 15 · phone 10 · visibility 5');
  console.log('');
  console.log(
    `  ${pad('tool', 22)}${padStart('score', 6)}${padStart('stubs', 7)}${padStart('tests', 7)}` +
      `${padStart('modules', 9)}${padStart('srcLoC', 8)}${padStart('testLoC', 9)}`,
  );
  console.log(`  ${'-'.repeat(76)}`);

  for (const row of rows.sort((a, b) => b.total - a.total)) {
    console.log(
      `  ${pad(row.name.slice(0, 21), 22)}${padStart(row.total, 6)}${padStart(row.stubs, 7)}` +
        `${padStart(row.testFiles, 7)}${padStart(`${row.moduleCoverage}%`, 9)}` +
        `${padStart(row.sourceLoc, 8)}${padStart(row.testLoc, 9)}`,
    );
  }

  console.log('');
  console.log('  score breakdown (stub / test / prove / handoff / phone / see)');
  for (const row of rows.sort((a, b) => b.total - a.total)) {
    const s = row.scores;
    console.log(
      `  ${pad(row.slug, 16)}${padStart(s.stubs, 4)}${padStart(s.tests, 6)}` +
        `${padStart(s.provability, 7)}${padStart(s.handoff, 8)}${padStart(s.phone, 7)}${padStart(s.visibility, 6)}`,
    );
  }

  if (broken.length) {
    console.log('');
    console.log('  not audited:');
    for (const row of broken) {
      console.log(`  ${pad(row.slug, 16)}${row.missing ? 'path missing' : row.error}`);
    }
  }

  if (flag('verbose')) {
    for (const row of rows) {
      console.log('');
      console.log(`  ── ${row.name} (${row.total}) ─────────────────────────────`);
      console.log(`  modules with a test: ${row.testedModules}/${row.sourceFiles}`);
      if (row.stubFindings.length) {
        console.log('  stubs:');
        for (const f of row.stubFindings) {
          console.log(`    ${f.file}:${f.line}  ${f.kind}  ${f.why}`);
        }
      } else {
        console.log('  stubs: none found');
      }
      if (row.uncoveredCount) {
        console.log(`  no test beside (${row.uncoveredCount}):`);
        for (const m of row.untestedModules.slice(0, 6)) console.log(`    ${m}`);
      }
      console.log(`  proof: ${row.provabilityPresent.join(', ') || 'nothing'}`);
      console.log(`  handoff: ${row.handoffPresent.join(', ') || 'none'}`);
      console.log(`  surface: ${row.surfaceDetected.join(' · ')}`);
    }
  }

  console.log('');
  const avg = rows.length
    ? Math.round(rows.reduce((sum, r) => sum + r.total, 0) / rows.length)
    : 0;
  console.log(`  ${rows.length} tools audited · average ${avg}/100`);
  console.log('');
}

main();
