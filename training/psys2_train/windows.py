"""Overlapping windows for inputs longer than the model limits (review F8): 192 tokens for segmentation, 128 for routing.

Mirror of `windowSpans` in src/formalizer/dispatcher-runtime.mjs (the browser runtime); the same rules apply in both:
  * window_spans(n, size, stride): [(a, b)) of at most `size` tokens, `stride` apart (default size // 2), the last one ends at n;
  * segmentation: a token takes the probability of every window that sees it, weighted by the distance to the window edge;
  * routing: the segment text is cut into windows of its own tokens (each keeps the context prefix), world probabilities are averaged.
"""
from __future__ import annotations


def window_spans(n, size, stride=None):
    stride = stride or max(1, size // 2)
    if n <= size:
        return [(0, n)]
    out, a = [], 0
    while a + size < n:
        out.append((a, a + size)); a += stride
    out.append((n - size, n))
    return out


def merge_window_probs(n, spans, window_probs):
    """window_probs[i][k] = P(B) of inner token a_i + k in window i. Returns n merged probabilities (edge-distance weighted mean)."""
    acc, wsum = [0.0] * n, [0.0] * n
    for (a, b), probs in zip(spans, window_probs):
        for k in range(a, b):
            r = k - a + 1; w = min(r, b - k)
            acc[k] += w * probs[k - a]; wsum[k] += w
    return [x / w for x, w in zip(acc, wsum)]
