"""A tiny randomly initialised BERT with a locally trained WordPiece vocabulary (no download): for the smoke test only."""
from __future__ import annotations
from pathlib import Path


def build_tiny(out_dir, texts, vocab_size=2000):
    from tokenizers import BertWordPieceTokenizer
    from transformers import BertConfig, BertModel, BertTokenizerFast
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    corpus = out / "corpus.txt"
    corpus.write_text("\n".join(texts) + "\ntab recent none\n")
    wp = BertWordPieceTokenizer(lowercase=True)
    wp.train([str(corpus)], vocab_size=vocab_size, min_frequency=1)
    wp.save_model(str(out))
    tok = BertTokenizerFast(vocab_file=str(out / "vocab.txt"), do_lower_case=True)
    tok.save_pretrained(out)
    cfg = BertConfig(vocab_size=tok.vocab_size, hidden_size=64, num_hidden_layers=2, num_attention_heads=2, intermediate_size=128, max_position_embeddings=256)
    BertModel(cfg).save_pretrained(out)
    return str(out)
