---
title: "Markov Decision Process"
slug: markov-decision-process
category: concept
tags: [reinforcement-learning, math, probability]
sources: [src_rl002]
created: "2026-03-15T14:30:00.000Z"
updated: "2026-03-15T14:30:00.000Z"
summary: "Mathematical framework for modeling sequential decision-making under uncertainty"
---

# Markov Decision Process

A Markov Decision Process (MDP) is the formal mathematical framework underlying [[reinforcement-learning]]. It models an agent making a sequence of decisions in an environment where outcomes are partly random and partly under the agent's control.

## Definition

An MDP is defined by the tuple (S, A, P, R, γ):

- **S** — a set of states the environment can be in
- **A** — a set of actions available to the agent
- **P(s'|s,a)** — transition function giving the probability of reaching state s' after taking action a in state s
- **R(s,a)** — reward function, the immediate signal received after taking action a in state s
- **γ** — discount factor (0 ≤ γ ≤ 1), controlling how much future rewards are worth relative to immediate rewards

## The Markov Property

The defining assumption: the future depends only on the current state, not on how the agent got there. Formally: P(s_{t+1} | s_t, a_t) = P(s_{t+1} | s_t, a_t, s_{t-1}, a_{t-1}, ...). This "memoryless" property makes the math tractable.

## Value Functions

The **state-value function** V_π(s) gives the expected cumulative discounted reward from state s under policy π. The **action-value function** Q_π(s,a) gives the expected return from taking action a in state s, then following π. The Bellman equations express these recursively, forming the basis for most RL algorithms.

## See Also

- [[reinforcement-learning]]
