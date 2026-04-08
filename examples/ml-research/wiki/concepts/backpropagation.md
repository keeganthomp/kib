---
title: "Backpropagation"
slug: backpropagation
category: concept
tags: [optimization, neural-networks, training]
sources: [src_bp003]
created: "2026-03-15T14:30:00.000Z"
updated: "2026-03-15T14:30:00.000Z"
summary: "Algorithm for computing gradients in neural networks via the chain rule"
---

# Backpropagation

Backpropagation (back-propagation of errors) is the algorithm that makes training deep neural networks practical. It efficiently computes the gradient of a loss function with respect to every weight in the network by applying the chain rule of calculus, layer by layer, from output back to input.

## How It Works

1. **Forward pass**: Input flows through the network, each layer computing activations, producing a final output and a loss value.
2. **Backward pass**: Starting from the loss, compute the gradient at each layer by multiplying local gradients backward through the network.
3. **Weight update**: Use the computed gradients with [[gradient-descent]] (or a variant like Adam) to adjust weights in the direction that reduces the loss.

## The Key Insight

For a hidden unit j, the error signal δ_j is computed by propagating errors backward from the layers above:

```
δ_j = f'(x_j) · Σ_k δ_k · w_kj
```

This recursive formula means we can compute gradients for every weight in an arbitrarily deep network in a single backward pass — the same computational cost as the forward pass.

## Historical Significance

Rumelhart, Hinton, and Williams popularized backpropagation in their 1986 Nature paper. Before this work, there was no known efficient method to train multi-layer networks. Backpropagation showed that hidden layers could learn useful internal representations without explicit supervision, unlocking the power of deep learning.

## Modern Usage

Every modern deep learning framework (PyTorch, TensorFlow, JAX) implements automatic differentiation, which generalizes backpropagation to arbitrary computation graphs. The core idea remains identical.

## See Also

- [[gradient-descent]]
