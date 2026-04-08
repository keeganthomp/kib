# Example Vaults

Pre-built kib vaults demonstrating different use cases. Each vault includes raw sources, compiled wiki articles, a knowledge graph, and a complete manifest — ready to explore with `kib search`, `kib query`, and `kib chat`.

## Vaults

### [`ml-research/`](ml-research/)

A machine learning research vault built from seminal papers and tutorials. Demonstrates how kib distills technical content into interconnected concept articles.

- **3 sources**: Attention Is All You Need, RL overview, backpropagation paper
- **7 articles**: attention mechanism, transformers, reinforcement learning, backpropagation, gradient descent, MDPs, researcher reference
- **Tags**: deep-learning, nlp, optimization, reinforcement-learning

### [`software-docs/`](software-docs/)

A software engineering knowledge base covering APIs, version control, CI/CD, and cloud-native patterns. Shows how kib organizes practical development knowledge.

- **4 sources**: REST API tutorial, Git repo, CI article, Twelve-Factor App
- **8 articles**: REST API, HTTP methods, Git, version control, CI, CD, API design patterns, twelve-factor app
- **Tags**: api, git, ci-cd, devops, architecture

### [`reading-list/`](reading-list/)

A personal reading notes vault from non-fiction books and articles. Demonstrates kib as a tool for synthesizing ideas across books into a personal knowledge graph.

- **4 sources**: Thinking Fast and Slow, Design of Everyday Things, Mental Models blog, Atomic Habits
- **10 articles**: cognitive biases, System 1/2, mental models, affordances, habit formation, decision making, design principles, atomic habits framework, Kahneman, Don Norman
- **Tags**: psychology, thinking, design, habits, decision-making

## Try It

```bash
# Browse a vault
cd examples/ml-research
kib status
kib search "attention"
kib query "How do transformers work?"

# Or point kib at it from anywhere
kib --vault examples/reading-list search "cognitive biases"
```

## Using as a Starting Point

These vaults are fully functional but static (the raw sources are excerpts, not full documents). To build your own vault from scratch:

```bash
kib init my-vault
cd my-vault
kib ingest https://example.com/article
kib compile
```
