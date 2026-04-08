---
title: "A (Long) Peek into Reinforcement Learning"
source_type: web
url: "https://lilianweng.github.io/posts/2018-02-19-rl-overview/"
author: "Lilian Weng"
date: "2018-02-19"
ingested: "2026-03-05"
word_count: 12000
---

# A (Long) Peek into Reinforcement Learning

Reinforcement learning (RL) is one approach to machine learning where an agent learns to make decisions by interacting with an environment. Unlike supervised learning, the agent isn't told what the correct action is — instead it discovers which actions yield the most reward through trial and error.

## Key Concepts

### Agent and Environment

The agent is the learner and decision-maker. The environment is everything the agent interacts with. At each time step, the agent observes the current state, takes an action, and receives a reward signal along with the next state.

### Markov Decision Process

A Markov Decision Process (MDP) provides the mathematical framework for RL. An MDP is defined by:
- S: a set of states
- A: a set of actions
- P(s'|s,a): transition probability function
- R(s,a): reward function
- γ: discount factor (0 ≤ γ ≤ 1)

The Markov property states that the future depends only on the current state, not the history of states.

### Policy

A policy π(a|s) defines the agent's behavior — the probability of taking action a in state s. The goal is to find a policy that maximizes the expected cumulative reward.

### Value Functions

The state-value function V_π(s) represents the expected return starting from state s and following policy π. The action-value function Q_π(s,a) represents the expected return starting from state s, taking action a, then following policy π.

## Methods

### Model-Free Methods

**Q-Learning**: An off-policy method that learns the optimal Q-function directly. The update rule:
Q(s,a) ← Q(s,a) + α[r + γ max_a' Q(s',a') - Q(s,a)]

**SARSA**: An on-policy variant that updates based on the action actually taken.

**Policy Gradient**: Instead of learning a value function, directly optimize the policy. REINFORCE is the simplest policy gradient method, using Monte Carlo sampling to estimate the gradient.

### Deep Reinforcement Learning

DQN (Deep Q-Network) uses a neural network to approximate the Q-function, enabling RL in high-dimensional state spaces like raw pixels. Key innovations include experience replay and target networks for stability.

Policy gradient methods scale naturally with deep networks. Actor-critic methods combine value function estimation with policy optimization — the critic evaluates, the actor improves.
