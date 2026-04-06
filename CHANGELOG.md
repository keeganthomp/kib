# Changelog

## [0.2.0](https://github.com/keeganthomp/kib/compare/v0.1.0...v0.2.0) (2026-04-06)


### Features

* add release pipeline, interactive provider setup, and npm packaging ([a278f42](https://github.com/keeganthomp/kib/commit/a278f42e06ec1c9a5464a41da31aa6a72cc7f2fe))
* bootstrap kib monorepo with bun workspaces, biome, CI ([918d405](https://github.com/keeganthomp/kib/commit/918d4054a2437fe45430eed77ce86d8552b9c045))
* **cli:** add kib init, config, and status commands with UI helpers ([62df3c9](https://github.com/keeganthomp/kib/commit/62df3c9c97908b39243d6b808275b91afd3ce68e))
* **cli:** add kib watch (file watcher + HTTP server) and kib export (markdown + HTML) ([0547d05](https://github.com/keeganthomp/kib/commit/0547d0534d4bcc2cd87a4189e535b4f57b86adfe))
* **core,cli:** add BM25 search engine and kib search command ([df09b6a](https://github.com/keeganthomp/kib/commit/df09b6aab1412c8cc9fabdf9386b88be8867837e))
* **core,cli:** add ingest orchestrator and kib ingest command ([098929e](https://github.com/keeganthomp/kib/commit/098929ea2090ea2ed4f3c84d66c3cdef9c05b8a1))
* **core,cli:** add lint engine with 5 rules and kib lint command ([ca257d9](https://github.com/keeganthomp/kib/commit/ca257d961a3ee3310c4d7359221c01a214b9ff3b))
* **core,cli:** add LLM response cache and kib compile command ([b26d8fe](https://github.com/keeganthomp/kib/commit/b26d8fef6dbe4e60590babe7641e1ccaea25d04d))
* **core,cli:** add RAG query engine, kib query, kib chat, and BM25 stemming ([657cd53](https://github.com/keeganthomp/kib/commit/657cd533958875f209208ae630570b537b09ab01))
* **core,cli:** add skill system with loader, runner, built-in skills, and kib skill command ([344c31f](https://github.com/keeganthomp/kib/commit/344c31f3c18ef279daff9b960945b95af76b360f))
* **core:** add compile engine with orchestrator, INDEX/GRAPH generation, and backlinks ([4e35cf1](https://github.com/keeganthomp/kib/commit/4e35cf18aa45f863a5b83c637fe9ba98ca629ee8))
* **core:** add file, PDF, YouTube, and GitHub extractors with tests ([928cd15](https://github.com/keeganthomp/kib/commit/928cd151daa4d0fab5a337d5db693f76e2419902))
* **core:** add LLM provider interface with Anthropic, OpenAI, and Ollama adapters ([b8dcc89](https://github.com/keeganthomp/kib/commit/b8dcc891483fe331620518052ef4496a53667b8a))
* **core:** add source type detection, extractor interface, and normalize utilities ([c7edec0](https://github.com/keeganthomp/kib/commit/c7edec05d40250751ca1adf065950c4f4f0c05ec))
* **core:** add types, Zod schemas, constants, and error classes ([9e5b114](https://github.com/keeganthomp/kib/commit/9e5b11484f17c61de4b1f0c5f772eef6ba30b128))
* **core:** add vault filesystem operations and content hashing ([ed60ee8](https://github.com/keeganthomp/kib/commit/ed60ee87c0bb2fd7f2a68a626e304e3067e0bd0c))
* **core:** add web extractor with HTML parsing and markdown conversion ([3750f09](https://github.com/keeganthomp/kib/commit/3750f0905259c7ca68a4742c68f0bb0d5d12db23))


### Bug Fixes

* **ci:** single release instead of per-package duplicates ([9d5fb94](https://github.com/keeganthomp/kib/commit/9d5fb94d4ad371a4755e0466386d7645b963013a))
* **ci:** single release instead of per-package duplicates ([62791de](https://github.com/keeganthomp/kib/commit/62791deff93190c6940ff9ab7b1ff8906a4e6602))
* **ci:** use .npmrc for npm auth instead of env var ([6baecd8](https://github.com/keeganthomp/kib/commit/6baecd8a9e223e26e10f7a4ed22b05e1ce1b5e34))
* **ci:** use .npmrc for npm auth instead of env var ([31817bb](https://github.com/keeganthomp/kib/commit/31817bb6954fc8f96aeae884d4ae7298702ae8ec))
* **ci:** write .npmrc to package dirs for bun publish auth ([660a27d](https://github.com/keeganthomp/kib/commit/660a27d4de763ded9fdae9194564fea56f7a53cc))
* **ci:** write .npmrc to package dirs for bun publish auth ([2d97d7e](https://github.com/keeganthomp/kib/commit/2d97d7ecf55ea3a9f0d53b85ca73a856ad7b8662))
* **cli:** use public @kib/core exports instead of deep path imports ([76791ff](https://github.com/keeganthomp/kib/commit/76791ff5df5395e1e90de740503bd182eeeb07ad))
