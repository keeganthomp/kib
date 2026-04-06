# Changelog

## [0.1.1](https://github.com/keeganthomp/kib/compare/cli-v0.1.0...cli-v0.1.1) (2026-04-06)


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


### Bug Fixes

* **cli:** use public @kib/core exports instead of deep path imports ([76791ff](https://github.com/keeganthomp/kib/commit/76791ff5df5395e1e90de740503bd182eeeb07ad))
