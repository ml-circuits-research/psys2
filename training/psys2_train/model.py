"""Backbone + heads: per-token slot tagging, sequence-level intent (skeleton) classification, routing classification."""
from __future__ import annotations
import torch
from torch import nn
from transformers import AutoModel

LORA_TARGETS = {
    "modernbert": ["Wqkv", "Wo", "Wi"],
    "distilbert": ["q_lin", "k_lin", "v_lin", "out_lin", "lin1", "lin2"],
    "bert": ["query", "key", "value", "dense"],
    "roberta": ["query", "key", "value", "dense"],
}


class Psys2Model(nn.Module):
    """The three heads share one backbone. Any head may be absent (size 0): world runs use tag+intent, the routing run routing."""

    def __init__(self, backbone, n_tags=0, n_intents=0, n_routes=0, dropout=0.1):
        super().__init__()
        self.backbone = backbone
        h = backbone.config.hidden_size
        self.drop = nn.Dropout(dropout)
        self.tag_head = nn.Linear(h, n_tags) if n_tags else None
        self.intent_head = nn.Linear(h, n_intents) if n_intents else None
        self.route_head = nn.Linear(h, n_routes) if n_routes else None

    def forward(self, input_ids, attention_mask, tag_labels=None, intent_labels=None, route_labels=None, weights=None):
        hs = self.backbone(input_ids=input_ids, attention_mask=attention_mask).last_hidden_state
        hs = self.drop(hs)
        out, loss = {}, hs.new_zeros(())
        w = weights if weights is not None else hs.new_ones(hs.shape[0])
        if self.tag_head is not None:
            lg = self.tag_head(hs)
            out["tag_logits"] = lg
            if tag_labels is not None:
                ce = nn.functional.cross_entropy(lg.transpose(1, 2), tag_labels, ignore_index=-100, reduction="none")
                m = (tag_labels != -100).float()
                loss = loss + ((ce * m).sum(1) / m.sum(1).clamp(min=1) * w).mean()
        for name, head, labels in (("intent", self.intent_head, intent_labels), ("route", self.route_head, route_labels)):
            if head is not None:
                lg = head(hs[:, 0])
                out[name + "_logits"] = lg
                if labels is not None:
                    loss = loss + (nn.functional.cross_entropy(lg, labels, reduction="none") * w).mean()
        out["loss"] = loss
        return out


def build_model(model_name_or_path, n_tags=0, n_intents=0, n_routes=0, lora=True, lora_r=16, lora_alpha=32, lora_dropout=0.05, target_modules=None):
    backbone = AutoModel.from_pretrained(model_name_or_path)
    if lora:
        from peft import LoraConfig, get_peft_model
        mt = backbone.config.model_type
        targets = target_modules or LORA_TARGETS.get(mt, ["query", "value"])
        backbone = get_peft_model(backbone, LoraConfig(r=lora_r, lora_alpha=lora_alpha, lora_dropout=lora_dropout, target_modules=targets, bias="none"))
    return Psys2Model(backbone, n_tags, n_intents, n_routes)


def trainable_summary(model):
    t = sum(p.numel() for p in model.parameters() if p.requires_grad)
    a = sum(p.numel() for p in model.parameters())
    return {"trainable": t, "total": a}
