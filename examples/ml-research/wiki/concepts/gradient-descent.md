---
title: "Gradient Descent"
slug: gradient-descent
category: concept
tags: [optimization, training]
sources: [src_bp003]
created: "2026-03-15T14:30:00.000Z"
updated: "2026-03-15T14:30:00.000Z"
summary: "Iterative optimization algorithm that follows the negative gradient to minimize loss"
---

# Gradient Descent

Gradient descent is the foundational optimization algorithm in machine learning. It iteratively adjusts parameters in the direction that most rapidly decreases the loss function — the negative gradient.

## Update Rule

```
θ ← θ - α · ∇L(θ)
```

Where θ represents the model parameters, α is the learning rate, and ∇L(θ) is the gradient of the loss function. The gradient tells us which direction increases the loss fastest, so we step in the opposite direction.

## Variants

### Stochastic Gradient Descent (SGD)

Instead of computing the gradient over the entire dataset, SGD estimates it from a single random sample (or mini-batch). This is noisier but dramatically faster per step, and the noise actually helps escape shallow local minima.

### Adam

Adaptive Moment Estimation combines momentum (exponential moving average of gradients) with adaptive per-parameter learning rates (based on the second moment of gradients). It's the default optimizer for most deep learning tasks due to its robustness.

### Learning Rate Schedules

The learning rate α is crucial — too large and training diverges, too small and it stalls. Common schedules include linear warmup, cosine decay, and step decay. Modern approaches like the 1-cycle policy vary the learning rate dynamically throughout training.

## Relationship to Backpropagation

Gradient descent specifies *what to do* with gradients (step downhill). [[Backpropagation]] specifies *how to compute* them efficiently. Together they form the training loop for neural networks.

## See Also

- [[backpropagation]]
