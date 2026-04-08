---
title: "Transformer Architecture"
slug: transformer-architecture
category: topic
tags: [deep-learning, nlp, architecture]
sources: [src_att001]
created: "2026-03-15T14:30:00.000Z"
updated: "2026-03-15T14:30:00.000Z"
summary: "Neural network architecture based entirely on self-attention, replacing recurrence and convolutions"
---

# Transformer Architecture

The Transformer, introduced by [[vaswani-et-al]] in 2017, is a neural network architecture that processes sequences using only [[attention-mechanism]] — no recurrence, no convolutions. It has become the dominant architecture in NLP and is increasingly adopted in vision, audio, and multimodal tasks.

## Architecture

### Encoder-Decoder Structure

The original Transformer uses an encoder-decoder layout:

- **Encoder**: 6 identical layers, each with multi-head self-attention followed by a position-wise feed-forward network. Residual connections and layer normalization wrap each sub-layer.
- **Decoder**: 6 identical layers with an additional cross-attention sub-layer that attends to encoder output. The self-attention is masked to prevent attending to future positions (causal masking).

### Positional Encoding

Since self-attention is permutation-invariant (order-agnostic), the model needs explicit position information. The original Transformer uses sinusoidal positional encodings added to the input embeddings. Modern variants use learned position embeddings or relative position schemes (RoPE, ALiBi).

## Variants

- **Encoder-only** (BERT): bidirectional self-attention, used for understanding tasks
- **Decoder-only** (GPT): causal self-attention, used for generation — now the dominant paradigm for LLMs
- **Encoder-decoder** (T5, BART): original layout, used for translation and summarization

## Why It Works

1. **Parallelism**: unlike RNNs, all positions are processed simultaneously
2. **Long-range dependencies**: every position can directly attend to every other position, regardless of distance
3. **Scalability**: performance scales reliably with model size, data, and compute (scaling laws)

## Impact

The Transformer enabled the modern era of large language models. GPT, BERT, T5, PaLM, Claude, and virtually every major LLM is based on it. The same architecture has been adapted for vision (ViT), protein structure (AlphaFold), and [[reinforcement-learning]] (Decision Transformer).

## See Also

- [[attention-mechanism]]
- [[reinforcement-learning]]
