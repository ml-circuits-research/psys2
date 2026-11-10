// Versioned module graph for workers (COMPUTE-BUDGET D item 4): a worker has no import map, so the build writes the versions into the imports themselves.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { versionGraph } from '../scripts/build-webchat.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = path.join(ROOT, 'docs/webchat');

async function tree(files) {
  const dir = await mkdtemp(path.join(tmpdir(), 'psys2-graph-'));
  for (const [rel, text] of Object.entries(files)) { await mkdir(path.dirname(path.join(dir, rel)), { recursive: true }); await writeFile(path.join(dir, rel), text); }
  return dir;
}
const base = {
  'lib/a.mjs': "import { b } from './b.mjs';\nexport const a = b + 1;\n",
  'lib/b.mjs': "import { c } from './sub/c.mjs';\nexport const b = 1;\nexport { c };\n",
  'lib/sub/c.mjs': "import { b } from '../b.mjs';   // a cycle with b\nexport const c = () => b;\n",
  'lib/d.mjs': "export const d = 1;\n",
  'worlds/w/ops.mjs': "import { d } from '../../lib/d.mjs';\nexport const x = async () => (await import('./helper.mjs')).h + d;\n",
  'worlds/w/helper.mjs': "export const h = 2;\n",
};

test('versionGraph: a module version covers everything it imports; a cycle is one unit; specifiers are rewritten to the target versions', async () => {
  const d1 = await tree(base), d2 = await tree({ ...base, 'lib/sub/c.mjs': base['lib/sub/c.mjs'] + '// changed\n' });
  try {
    const v1 = await versionGraph(d1), v2 = await versionGraph(d2);
    assert.equal(v1['lib/b.mjs'], v1['lib/sub/c.mjs'], 'b and c import each other: one version');
    assert.notEqual(v1['lib/a.mjs'], v1['lib/b.mjs']);
    for (const f of ['lib/a.mjs', 'lib/b.mjs', 'lib/sub/c.mjs']) assert.notEqual(v1[f], v2[f], `${f} changes when c changes`);
    for (const f of ['lib/d.mjs', 'worlds/w/ops.mjs', 'worlds/w/helper.mjs']) assert.equal(v1[f], v2[f], `${f} does not depend on c: still cached`);
    assert.match(await readFile(path.join(d1, 'lib/a.mjs'), 'utf8'), new RegExp(`from './b\\.mjs\\?v=${v1['lib/b.mjs']}'`));
    assert.match(await readFile(path.join(d1, 'lib/sub/c.mjs'), 'utf8'), new RegExp(`from '\\.\\./b\\.mjs\\?v=${v1['lib/b.mjs']}'`));
    const ops = await readFile(path.join(d1, 'worlds/w/ops.mjs'), 'utf8');
    assert.match(ops, new RegExp(`'\\.\\./\\.\\./lib/d\\.mjs\\?v=${v1['lib/d.mjs']}'`));
    assert.match(ops, new RegExp(`import\\('\\./helper\\.mjs\\?v=${v1['worlds/w/helper.mjs']}'\\)`), 'literal dynamic imports too');
  } finally { await rm(d1, { recursive: true, force: true }); await rm(d2, { recursive: true, force: true }); }
});

async function walk(dir, out = []) {
  for (const e of await readdir(dir)) { const f = path.join(dir, e); if ((await stat(f)).isDirectory()) await walk(f, out); else if (e.endsWith('.mjs')) out.push(f); }
  return out;
}

test('built webchat: every relative import in lib/ and worlds/ names its target version, equal to the page\'s version map and import map', async () => {
  const html = await readFile(path.join(WEB, 'index.html'), 'utf8');
  const map = JSON.parse(/<script type="importmap">(.*?)<\/script>/.exec(html)[1]).imports;
  const mod = JSON.parse(/window\.__psys2Mod = (.*?);<\/script>/.exec(html)[1]);
  let checked = 0;
  for (const sub of ['lib', 'worlds']) {
    for (const f of await walk(path.join(WEB, sub))) {
      const rel = path.relative(WEB, f).split(path.sep).join('/');
      assert.equal(map[`./${rel}`], `./${rel}?v=${mod[rel]}`, `import map entry of ${rel}`);
      const text = await readFile(f, 'utf8');
      for (const m of text.matchAll(/(?:from\s*|import\s*\(?\s*)['"](\.{1,2}\/[^'"]+\.mjs)(\?v=[0-9a-f]+)?['"]/g)) {
        const target = path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1]));
        if (!mod[target]) continue;
        assert.equal(m[2], `?v=${mod[target]}`, `${rel} imports ${m[1]} with the version of ${target}`);
        checked++;
      }
    }
  }
  assert.ok(checked > 150, `checked ${checked} imports`);
});

test('the ui files the engine worker loads import nothing relative (a worker has no import map): lib is reached by versioned URL only', async () => {
  for (const f of ['engine-worker', 'translation', 'dispatcher-host', 'normalizer-host', 'ort-host']) {
    const text = await readFile(path.join(WEB, 'ui', `${f}.mjs`), 'utf8');
    const rel = [...text.matchAll(/^\s*(?:import|export)\s[^'"`;]*?from\s*['"](\.{1,2}\/[^'"]+)['"]|^\s*import\s*['"](\.{1,2}\/[^'"]+)['"]/gm)];
    assert.deepEqual(rel.map((m) => m[1] ?? m[2]), [], `${f}.mjs has a static relative import`);
  }
});
