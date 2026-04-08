---
title: "Attention Mechanism"
slug: attention-mechanism
category: concept
tags: [deep-learning, nlp, attention]
sources: [src_att001]
created: "2026-03-15T14:30:00.000Z"
updated: "2026-03-15T14:30:00.000Z"
summary: "Mechanism that lets models dynamically focus on relevant parts of the input"
---

# Attention Mechanism

The attention mechanism allows neural networks to dynamically focus on the most relevant parts of the input when producing each element of the output. Rather than compressing an entire input sequence into a single fixed-length vector, attention computes a weighted combination of all input positions, with weights determined by relevance to the current output step.

## Scaled Dot-Product Attention

The core operation computes attention scores between queries (Q) and keys (K), then uses those scores to weight the values (V):

```
Attention(Q, K, V) = softmax(QK^T / sqrt(d_k)) V
```

The scaling factor `sqrt(d_k)` prevents dot products from growing too large in high-dimensional spaces, which would push softmax into regions with vanishingly small gradients.

## Multi-Head Attention

Instead of computing a single attention function, the [[transformer-architecture]] uses multiple "heads" that attend to different representation subspaces. Each head independently computes attention with its own learned projections, and the results are concatenated and projected back.

This enables the model to simultaneously attend to information from different positions and different feature dimensions.

## Self-Attention vs Cross-Attention

- **Self-attention**: queries, keys, and values all come from the same sequence. Each position attends to every other position in the same input.
- **Cross-attention**: queries come from one sequence (e.g., decoder), while keys and values come from another (e.g., encoder output).

## Training

Attention weights are learned end-to-end through [[backpropagation]] — no explicit supervision is needed to tell the model what to attend to. The model discovers useful attention patterns from the task loss signal alone.

## See Also

- [[transformer-architecture]]
- [[backpropagation]]
