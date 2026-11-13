/**
 * Node host of the shared runtime configuration (src/dialog/runtime-config.mjs, spec 03 section 7.14): loads the dispatcher and the
 * normalizer through onnxruntime-node (not a repository dependency: the entry point is passed in) and wires them with createRuntime,
 * exactly as docs/webchat/app.mjs does with onnxruntime-web. Used by eval-operational (and any evaluator that needs the shipped pipeline).
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRuntime, settingsForMode, runtimeSettings } from '../../src/dialog/runtime-config.mjs';
import { createWordPieceTokenizer } from '../../src/formalizer/wordpiece.mjs';
import { createNormalizerRuntime } from '../../src/dialog/normalizer-runtime.mjs';

export const DEFAULT_DISPATCHER_DIR = 'docs/webchat/models/dispatcher';
export const DEFAULT_NORMALIZER_DIR = 'docs/webchat/models/normalizer';
const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');
const readJSON = (f) => JSON.parse(readFileSync(f, 'utf8'));

async function loadOrt(ortPath) {
  if (!ortPath) throw new Error('--ort <path to onnxruntime-node entry> is required (or use --mode rules)');
  const mod = await import(pathToFileURL(resolve(ortPath)).href);
  return mod.InferenceSession ? mod : mod.default;
}

/** sha256 of the dispatcher and normalizer onnx files, next to what meta.json publishes (`match`: the files are the published version). */
export function modelHashes({ dispatcherDir, normalizerDir, withNormalizer }) {
  const out = {};
  const dm = readJSON(join(dispatcherDir, 'meta.json'));
  const dsha = sha256(join(dispatcherDir, 'model.int8.onnx'));
  out.dispatcher = { file: 'model.int8.onnx', sha256: dsha, meta_sha256: dm.version?.sha256 ?? null, match: dm.version?.sha256 === dsha, export_date: dm.version?.export_date ?? null };
  if (withNormalizer) {
    const nm = readJSON(join(normalizerDir, 'meta.json'));
    const files = {};
    for (const f of ['encoder.int8.onnx', 'decoder.int8.onnx']) files[f] = { sha256: sha256(join(normalizerDir, f)), meta_sha256: nm.version?.files_sha256?.[f] ?? null };
    out.normalizer = { files, meta_sha256: nm.version?.sha256 ?? null, match: Object.values(files).every((x) => x.sha256 === x.meta_sha256), export_date: nm.version?.export_date ?? null, policy: nm.policy ?? null };
  }
  return out;
}

/**
 * The pipeline of a mode: { settings, info, enc, normalizerHost }. mode: rules | encoder | encoder+n1 (settings come from runtime-config's MODES;
 * `overrides` patches them for experiments and is reported in info.settings). info = { mode, settings, hashes, load_ms }.
 */
export async function openNodeRuntime({ engine, mode, ortPath, dispatcherDir, normalizerDir, editTau, ortThreads = 0, overrides = {}, partsExtra = null }) {   // partsExtra: optional extra parts of the dispatcher runtime (ablation: `segmenter`)
  const settings = { ...settingsForMode(mode), ...overrides };
  const dDir = resolve(dispatcherDir ?? DEFAULT_DISPATCHER_DIR), nDir = resolve(normalizerDir ?? DEFAULT_NORMALIZER_DIR);
  const info = { mode, settings: runtimeSettings(settings), hashes: null, load_ms: { dispatcher: null, normalizer: null } };
  if (settings.formalizer === 'rules') return { settings, info, enc: null, normalizerHost: null };
  const ort = await loadOrt(ortPath);
  const threadOpts = ortThreads ? { intraOpNumThreads: ortThreads, interOpNumThreads: 1 } : {};   // one thread per shard worker
  const meta = readJSON(join(dDir, 'meta.json'));
  let normalizerHost = null;
  if (settings.normalizer !== false) {
    if (!existsSync(join(nDir, 'meta.json'))) throw new Error(`normalizer model missing in ${nDir}`);
    const nmeta = readJSON(join(nDir, 'meta.json'));
    const timings = [];
    let runtime = null;
    normalizerHost = {
      timings,
      provider: {
        stamp: () => `${nmeta.version?.sha256 ?? 'n1'}|${runtime ? 'ready' : 'idle'}`,
        async propose(req) {
          const t0 = performance.now();
          const rewrites = await runtime.propose(req);
          timings.push(performance.now() - t0);
          return { status: 'ready', rewrites };
        },
      },
      async prepare() {
        const t0 = performance.now();
        const opts = { graphOptimizationLevel: 'all', ...threadOpts };
        const encoder = await ort.InferenceSession.create(join(nDir, 'encoder.int8.onnx'), opts);
        const decoder = await ort.InferenceSession.create(join(nDir, 'decoder.int8.onnx'), opts);
        runtime = createNormalizerRuntime({ ort, encoder, decoder, tokenizer: readJSON(join(nDir, 'tokenizer.json')), config: nmeta.config });
        info.load_ms.normalizer = Math.round(performance.now() - t0);
      },
    };
  }
  const load = async () => {
    const session = await ort.InferenceSession.create(join(dDir, 'model.int8.onnx'), { graphOptimizationLevel: 'all', ...threadOpts });
    const editTags = meta.onnx?.outputs?.includes('edit_logits') ? readJSON(join(dDir, 'edit-vocab.json')).tags : null;
    const vocab = join(dDir, existsSync(join(dDir, 'vocab.txt')) ? 'vocab.txt' : 'tokenizer/vocab.txt');
    return { ort, session, tokenizer: createWordPieceTokenizer(readFileSync(vocab, 'utf8')), worlds: meta.worlds, editTags, editTau: editTau ?? meta.edit_threshold ?? 0.5, useContext: meta.context !== false, nx: meta.nx ?? null, ...(partsExtra ?? {}) };
  };
  const enc = createRuntime({ engine, settings, load, normalizer: normalizerHost?.provider ?? null, waitForModel: true });
  const t0 = performance.now();
  await enc.prepare();
  info.load_ms.dispatcher = Math.round(performance.now() - t0);
  await normalizerHost?.prepare();
  info.hashes = modelHashes({ dispatcherDir: dDir, normalizerDir: nDir, withNormalizer: !!normalizerHost });
  return { settings, info, enc, normalizerHost };
}
