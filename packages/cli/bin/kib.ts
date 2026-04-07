#!/usr/bin/env bun
import { loadCredentials } from "../src/ui/credentials.js";

// Load saved API keys before anything else
loadCredentials();

import { main } from "../src/index.js";

main();
