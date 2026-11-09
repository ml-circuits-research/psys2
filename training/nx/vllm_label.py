"""NX: offline batch labeling with vLLM. One request = one batch (25 sentences of one world), system prompt = the world prompt.

  python training/nx/vllm_label.py --model Qwen/Qwen3-30B-A3B-Instruct-2507-FP8 --name qwen30 \
      --batches training/dataset/nx/pilot/batches-all.json --out training/dataset/nx/pilot/out/qwen30
Writes <out>/<batch_id>.json (the raw JSON array text) and <out>/_stats.json (seconds, tokens). Resumable: existing files are skipped.
"""
import argparse, json, os, re, sys, time

def batch_text(items):
    out = []
    for k, x in enumerate(items):
        ctx = x.get("context") or []
        c = (" CONTEXT: " + " / ".join(json.dumps(t, ensure_ascii=False) for t in ctx) + " ::") if ctx else ""
        out.append(f"[{k + 1}]{c} SENTENCE: {json.dumps(x['text'], ensure_ascii=False)}")
    return "\n".join(out)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--name", required=True)
    ap.add_argument("--batches", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--gpu-util", type=float, default=0.4)
    ap.add_argument("--max-len", type=int, default=24000)
    ap.add_argument("--max-tokens", type=int, default=5000)
    ap.add_argument("--quant", default=None)
    ap.add_argument("--enforce-eager", action="store_true")
    a = ap.parse_args()
    from vllm import LLM, SamplingParams
    batches = json.load(open(a.batches))
    os.makedirs(a.out, exist_ok=True)
    todo = [b for b in batches if not os.path.exists(f"{a.out}/{b['batch_id']}.json")]
    print(f"{len(todo)} batches to do", flush=True)
    if not todo:
        return
    t0 = time.time()
    kw = dict(model=a.model, gpu_memory_utilization=a.gpu_util, max_model_len=a.max_len, trust_remote_code=True, enable_prefix_caching=True)
    if a.quant: kw["quantization"] = a.quant
    if a.enforce_eager: kw["enforce_eager"] = True
    llm = LLM(**kw)
    t_load = time.time() - t0
    msgs = []
    for b in todo:
        sysmsg = open(b["prompt_file"]).read()
        msgs.append([{"role": "system", "content": sysmsg}, {"role": "user", "content": "Label these sentences. Reply with the JSON array only.\n" + batch_text(b["items"])}])
    sp = SamplingParams(temperature=0.0, max_tokens=a.max_tokens)
    t1 = time.time()
    outs = llm.chat(msgs, sp)
    t_gen = time.time() - t1
    tin = tout = 0
    for b, o in zip(todo, outs):
        txt = o.outputs[0].text.strip()
        txt = re.sub(r"^```(?:json)?\s*|\s*```\s*$", "", txt)
        open(f"{a.out}/{b['batch_id']}.json", "w").write(txt)
        tin += len(o.prompt_token_ids); tout += len(o.outputs[0].token_ids)
    json.dump({"model": a.model, "load_s": t_load, "gen_s": t_gen, "batches": len(todo), "items": sum(len(b["items"]) for b in todo), "tokens_in": tin, "tokens_out": tout},
              open(f"{a.out}/_stats.json", "w"), indent=1)
    print("done", t_load, t_gen, flush=True)

if __name__ == "__main__":
    main()
