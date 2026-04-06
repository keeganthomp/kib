#!/usr/bin/env bun
import { loadCredentials } from "../src/ui/setup-provider.js";

// Load saved API keys before anything else
loadCredentials();

import { main } from "../src/index.js";

main();
