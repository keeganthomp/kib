# Software Docs Vault

A software engineering knowledge base covering APIs, version control, CI/CD, and cloud-native patterns.

## Sources

| Source | Type | Articles Produced |
|--------|------|-------------------|
| REST API Tutorial | web | rest-api, http-methods, api-design-patterns |
| Git (github.com/git/git) | github | version-control, git |
| Continuous Integration (Martin Fowler) | web | continuous-integration, continuous-deployment |
| The Twelve-Factor App | web | twelve-factor-app |

## Knowledge Graph

```
rest-api ─── http-methods
    │
api-design-patterns

version-control ─── git
                     │
continuous-integration ─── continuous-deployment
         │
  twelve-factor-app
```

## Try It

```bash
kib search "deployment"
kib query "What's the difference between CI and CD?"
kib skill run compare --args '{"a": "continuous-integration", "b": "continuous-deployment"}'
```
