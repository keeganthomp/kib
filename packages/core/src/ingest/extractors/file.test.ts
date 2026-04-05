import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileExtractor } from "./file.js";

let tempDir: string;
const extractor = createFileExtractor();

afterEach(async () => {
	if (tempDir) await rm(tempDir, { recursive: true, force: true });
});

async function makeTempDir() {
	tempDir = await mkdtemp(join(tmpdir(), "kib-file-test-"));
	return tempDir;
}

describe("file extractor", () => {
	test("extracts markdown files as-is", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "notes.md");
		await writeFile(path, "# My Notes\n\nSome content here.");

		const result = await extractor.extract(path);
		expect(result.title).toBe("Notes");
		expect(result.content).toBe("# My Notes\n\nSome content here.");
		expect(result.metadata.fileType).toBe(".md");
	});

	test("extracts plain text files as-is", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "readme.txt");
		await writeFile(path, "Plain text content.");

		const result = await extractor.extract(path);
		expect(result.title).toBe("Readme");
		expect(result.content).toBe("Plain text content.");
	});

	test("wraps code files in fenced code blocks", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "index.ts");
		await writeFile(path, 'const x = 1;\nconsole.log(x);');

		const result = await extractor.extract(path);
		expect(result.title).toBe("Index");
		expect(result.content).toContain("```typescript");
		expect(result.content).toContain("const x = 1;");
		expect(result.content).toContain("```");
		expect(result.metadata.language).toBe("typescript");
	});

	test("wraps Python files with python language tag", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "script.py");
		await writeFile(path, "def hello():\n    print('hello')");

		const result = await extractor.extract(path);
		expect(result.content).toContain("```python");
		expect(result.metadata.language).toBe("python");
	});

	test("wraps JSON files in code blocks", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "config.json");
		await writeFile(path, '{"key": "value"}');

		const result = await extractor.extract(path);
		expect(result.content).toContain("```json");
		expect(result.content).toContain('"key": "value"');
	});

	test("wraps YAML files in code blocks", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "config.yaml");
		await writeFile(path, "key: value");

		const result = await extractor.extract(path);
		expect(result.content).toContain("```yaml");
	});

	test("uses custom title from options", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "data.md");
		await writeFile(path, "# Content");

		const result = await extractor.extract(path, { title: "Custom Title" });
		expect(result.title).toBe("Custom Title");
	});

	test("formats filename with dashes into title", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "my-cool-notes.md");
		await writeFile(path, "content");

		const result = await extractor.extract(path);
		expect(result.title).toBe("My Cool Notes");
	});

	test("formats filename with underscores into title", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "project_ideas.md");
		await writeFile(path, "content");

		const result = await extractor.extract(path);
		expect(result.title).toBe("Project Ideas");
	});

	test("handles Rust files", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "main.rs");
		await writeFile(path, 'fn main() {\n    println!("Hello");\n}');

		const result = await extractor.extract(path);
		expect(result.content).toContain("```rust");
		expect(result.metadata.language).toBe("rust");
	});

	test("handles Go files", async () => {
		const dir = await makeTempDir();
		const path = join(dir, "main.go");
		await writeFile(path, 'package main\n\nfunc main() {}');

		const result = await extractor.extract(path);
		expect(result.content).toContain("```go");
		expect(result.metadata.language).toBe("go");
	});
});
