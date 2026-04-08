---
title: "Reinforcement Learning"
slug: reinforcement-learning
category: topic
tags: [reinforcement-learning, agents, rewards]
sources: [src_rl002]
created: "2026-03-15T14:30:00.000Z"
updated: "2026-03-15T14:30:00.000Z"
summary: "Learning paradigm where agents learn optimal behavior through trial-and-error interaction with an environment"
---

# Reinforcement Learning

Reinforcement learning (RL) is a machine learning paradigm where an agent learns to make decisions by interacting with an environment. Unlike supervised learning (where correct answers are provided) or unsupervised learning (where no feedback exists), RL agents receive reward signals that indicate how good their actions were — but must discover the best strategy through exploration.

## Core Loop

1. Agent observes state s_t from the environment
2. Agent selects action a_t based on its policy
3. Environment transitions to state s_{t+1} and emits reward r_t
4. Agent updates its policy to maximize cumulative future reward

This interaction is formalized as a [[markov-decision-process]].

## Exploration vs Exploitation

The fundamental tension in RL: should the agent exploit what it already knows works, or explore new actions that might yield higher rewards? Common strategies include ε-greedy (random action with probability ε), UCB (upper confidence bounds), and entropy regularization.

## Key Methods

### Value-Based Methods

Learn a value function (Q-values) that estimates expected return for each state-action pair. The agent acts greedily with respect to these values.

- **Q-Learning**: off-policy, learns optimal Q directly
- **DQN**: Q-learning with neural network function approximation, experience replay, and target networks

### Policy-Based Methods

Directly optimize the policy function π(a|s) using gradient ascent on expected return.

- **REINFORCE**: Monte Carlo policy gradient
- **PPO**: Proximal Policy Optimization, clips the gradient to prevent destructive updates — the most widely used policy gradient method

### Actor-Critic

Combines both: an actor (policy) decides actions, a critic (value function) evaluates them. The critic reduces variance of the policy gradient estimate, stabilizing training.

## Modern RL

RLHF (Reinforcement Learning from Human Feedback) applies RL to align language models with human preferences. A reward model trained on human comparisons replaces the environment reward, and PPO fine-tunes the LLM to maximize it.

## See Also

- [[markov-decision-process]]
