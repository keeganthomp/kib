---
title: "Attention Is All You Need"
source_type: web
url: "https://arxiv.org/abs/1706.03762"
author: "Vaswani et al."
date: "2017-06-12"
ingested: "2026-03-01"
word_count: 9200
---

# Attention Is All You Need

The dominant sequence transduction models are based on complex recurrent or convolutional neural networks that include an encoder and a decoder. The best performing models also connect the encoder and decoder through an attention mechanism. We propose a new simple network architecture, the Transformer, based solely on attention mechanisms, dispensing with recurrence and convolutions entirely.

## Architecture

The Transformer follows an encoder-decoder structure using stacked self-attention and point-wise, fully connected layers for both the encoder and decoder.

### Encoder

The encoder is composed of a stack of N=6 identical layers. Each layer has two sub-layers: a multi-head self-attention mechanism and a simple position-wise fully connected feed-forward network. We employ a residual connection around each of the two sub-layers, followed by layer normalization.

### Decoder

The decoder is also composed of a stack of N=6 identical layers. In addition to the two sub-layers in each encoder layer, the decoder inserts a third sub-layer which performs multi-head attention over the output of the encoder stack.

## Attention

An attention function maps a query and a set of key-value pairs to an output, where the query, keys, values, and output are all vectors. The output is computed as a weighted sum of the values, where the weight assigned to each value is computed by a compatibility function of the query with the corresponding key.

### Scaled Dot-Product Attention

We compute the attention function on a set of queries simultaneously, packed together into a matrix Q. The keys and values are also packed together into matrices K and V:

Attention(Q, K, V) = softmax(QK^T / sqrt(d_k)) V

### Multi-Head Attention

Instead of performing a single attention function, we found it beneficial to linearly project the queries, keys and values h times with different, learned linear projections. On each of these projected versions we perform the attention function in parallel, yielding d_v-dimensional output values.

## Results

The Transformer achieves 28.4 BLEU on the WMT 2014 English-to-German translation task, improving over the existing best results by over 2 BLEU. On the English-to-French translation task, our model achieves 41.0 BLEU, outperforming all previously published single models.

## Training

We trained on the WMT 2014 English-German dataset consisting of about 4.5 million sentence pairs. Training took 3.5 days on 8 P100 GPUs.
