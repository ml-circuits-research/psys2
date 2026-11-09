"""Browser-limits experiment: random-init DistilBERT-base (same shape as our dispatcher), heads, LoRA as graph inputs."""
import torch, json, os, numpy as np
from torch import nn
from transformers import DistilBertConfig, DistilBertModel
torch.manual_seed(0)
OUT = '/home/claude/bexp/models'; os.makedirs(OUT, exist_ok=True)
cfg = DistilBertConfig(vocab_size=30522, dim=768, n_layers=6, n_heads=12, hidden_dim=3072)
base = DistilBertModel(cfg).eval()
R = 8
TARGETS = ['q_lin', 'k_lin', 'v_lin', 'out_lin', 'lin1', 'lin2']
mods = []
for li, layer in enumerate(base.transformer.layer):
    for n, m in list(layer.attention.named_children()) + list(layer.ffn.named_children()):
        if n in TARGETS: mods.append((f'L{li}.{n}', m))
class LoraLin(nn.Module):
    def __init__(s, lin): super().__init__(); s.lin = lin; s.A = None; s.B = None
    def forward(s, x):
        y = s.lin(x)
        return y if s.A is None else y + (x @ s.A) @ s.B
wrapped = []
for name, m in mods:
    parent = None
for li, layer in enumerate(base.transformer.layer):
    for holder in (layer.attention, layer.ffn):
        for n in TARGETS:
            if hasattr(holder, n) and isinstance(getattr(holder, n), nn.Linear):
                w = LoraLin(getattr(holder, n)); setattr(holder, n, w); wrapped.append((f'L{li}.{n}', w))
H = 768
class Heads(nn.Module):
    def __init__(s, n_tag_heads=24, n_tags=200, n_ops=600):
        super().__init__()
        s.span = nn.Linear(H, 2); s.op = nn.Linear(H, n_ops)
        s.tags = nn.ModuleList([nn.Linear(H, n_tags) for _ in range(n_tag_heads)])
class Full(nn.Module):
    def __init__(s, heads, lora=False):
        super().__init__(); s.enc = base; s.h = heads; s.lora = lora
    def forward(s, ids, mask, *lw):
        if s.lora:
            for i, (_, w) in enumerate(wrapped): w.A, w.B = lw[2*i], lw[2*i+1]
        hs = s.enc(input_ids=ids, attention_mask=mask).last_hidden_state
        for _, w in wrapped: w.A = w.B = None
        outs = [s.h.span(hs), s.h.op(hs[:, 0])] + [t(hs) for t in s.h.tags]
        return tuple(outs)
def export(model, path, lora=False, ntags=24):
    ids = torch.randint(0, 30000, (2, 16)); mask = torch.ones_like(ids)
    args = [ids, mask]; names = ['input_ids', 'attention_mask']
    if lora:
        for nm, w in wrapped:
            i, o = w.lin.in_features, w.lin.out_features
            args += [torch.randn(i, R) * 0.01, torch.zeros(R, o)]; names += [f'{nm}.A', f'{nm}.B']
    outn = ['span', 'op'] + [f'tag{k}' for k in range(ntags)]
    dyn = {'input_ids': {0: 'b', 1: 't'}, 'attention_mask': {0: 'b', 1: 't'}}
    torch.onnx.export(model, tuple(args), path, input_names=names, output_names=outn, dynamic_axes=dyn, opset_version=17, dynamo=False)
from onnxruntime.quantization import quantize_dynamic, QuantType
def q(src, dst): quantize_dynamic(src, dst, weight_type=QuantType.QInt8); os.remove(src)
with torch.no_grad():
    h0 = Heads(n_tag_heads=0); export(Full(h0), f'{OUT}/enc_plain.fp32.onnx', ntags=0); q(f'{OUT}/enc_plain.fp32.onnx', f'{OUT}/enc_plain.int8.onnx')
    h24 = Heads(24, 200, 600); export(Full(h24), f'{OUT}/enc_24heads.fp32.onnx'); q(f'{OUT}/enc_24heads.fp32.onnx', f'{OUT}/enc_24heads.int8.onnx')
    export(Full(h0, lora=True), f'{OUT}/enc_lora.fp32.onnx', lora=True, ntags=0); q(f'{OUT}/enc_lora.fp32.onnx', f'{OUT}/enc_lora.int8.onnx')
    # separate head-only graph
    class HeadOnly(nn.Module):
        def __init__(s): super().__init__(); s.t = nn.Linear(H, 200)
        def forward(s, hs): return s.t(hs)
    torch.onnx.export(HeadOnly(), (torch.randn(2, 16, H),), f'{OUT}/head200.onnx', input_names=['hs'], output_names=['tags'], dynamic_axes={'hs': {0: 'b', 1: 't'}}, opset_version=17, dynamo=False)
# LoRA shapes for the bench (B nonzero so the path is real)
shapes = {f'{nm}.A': [w.lin.in_features, R] for nm, w in wrapped} | {f'{nm}.B': [R, w.lin.out_features] for nm, w in wrapped}
json.dump(shapes, open(f'{OUT}/lora-shapes.json', 'w'))
# ORT adapter file for one world
import onnxruntime as ort
af = ort.AdapterFormat(); af.set_adapter_version(1); af.set_model_version(1)
params = {k: ort.OrtValue.ortvalue_from_numpy((np.random.randn(*v) * 0.01).astype(np.float32)) for k, v in shapes.items()}
af.set_parameters(params); af.export_adapter(f'{OUT}/world.onnx_adapter')
for f in sorted(os.listdir(OUT)): print(f, round(os.path.getsize(f'{OUT}/{f}') / 1e6, 2), 'MB')
