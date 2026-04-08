# ML Research Vault

A machine learning research knowledge base built from foundational papers and tutorials.

## Sources

| Source | Type | Articles Produced |
|--------|------|-------------------|
| Attention Is All You Need (Vaswani et al., 2017) | web | attention-mechanism, transformer-architecture, vaswani-et-al |
| A (Long) Peek into Reinforcement Learning (Lilian Weng) | web | reinforcement-learning, markov-decision-process |
| Learning representations by back-propagating errors (Rumelhart et al., 1986) | pdf | backpropagation, gradient-descent |

## Knowledge Graph

```
attention-mechanism ─── transformer-architecture
        │                       │
  backpropagation          reinforcement-learning
        │                       │
  gradient-descent      markov-decision-process
```

## Try It

```bash
kib search "attention"
kib query "Explain how transformers replaced RNNs"
kib skill run explain --args '{"topic": "backpropagation", "level": "beginner"}'
```
