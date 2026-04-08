---
title: "Learning representations by back-propagating errors"
source_type: pdf
url: "https://www.nature.com/articles/323533a0"
author: "Rumelhart, Hinton, Williams"
date: "1986-10-09"
ingested: "2026-03-10"
word_count: 4500
---

# Learning representations by back-propagating errors

We describe a new learning procedure, back-propagation, for networks of neurone-like units. The procedure repeatedly adjusts the weights of the connections in the network so as to minimize a measure of the difference between the actual output vector of the net and the desired output vector.

## The Learning Procedure

The total input x_j to unit j is a linear function of the outputs y_i of the units connected to j and the weights w_ji on these connections:

x_j = Σ_i y_i w_ji

The output of a unit is a non-linear function of its total input:

y_j = 1 / (1 + e^(-x_j))

We define a measure of error E as:

E = 1/2 Σ_j (y_j - d_j)^2

where d_j is the desired output of unit j. To minimize E by gradient descent, we need the partial derivative of E with respect to each weight:

∂E/∂w_ji = ∂E/∂x_j · ∂x_j/∂w_ji = δ_j · y_i

For output units, δ_j = (y_j - d_j) · y_j(1 - y_j).

For hidden units, we back-propagate: δ_j = y_j(1 - y_j) Σ_k δ_k w_kj

This allows us to compute the gradient for weights in any layer, enabling training of multi-layer networks.

## Results

We demonstrate the procedure on several tasks, showing that back-propagation creates useful internal representations in the hidden units. The network discovers features that are not explicitly present in the input or output — it learns to represent the structure of the task.

## Significance

Before this work, there was no known efficient method for training multi-layer neural networks. Backpropagation made deep networks trainable and is still the foundation of modern deep learning.
