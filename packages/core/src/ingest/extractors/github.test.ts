import { describe, expect, test } from "bun:test";
import { parseGithubUrl } from "./github.js";

describe("github extractor", () => {
	describe("parseGithubUrl", () => {
		test("parses owner/repo URL", () => {
			const result = parseGithubUrl("https://github.com/anthropics/claude-code");
			expect(result).toEqual({ owner: "anthropics", repo: "claude-code", branch: undefined });
		});

		test("parses URL with tree/branch", () => {
			const result = parseGithubUrl("https://github.com/anthropics/claude-code/tree/main/src");
			expect(result).toEqual({ owner: "anthropics", repo: "claude-code", branch: "main" });
		});

		test("parses URL with www", () => {
			const result = parseGithubUrl("https://www.github.com/user/repo");
			expect(result).toEqual({ owner: "user", repo: "repo", branch: undefined });
		});

		test("returns null for non-github URL", () => {
			expect(parseGithubUrl("https://gitlab.com/user/repo")).toBeNull();
		});

		test("returns null for github.com with only user", () => {
			expect(parseGithubUrl("https://github.com/user")).toBeNull();
		});

		test("returns null for github.com root", () => {
			expect(parseGithubUrl("https://github.com")).toBeNull();
		});

		test("returns null for invalid URL", () => {
			expect(parseGithubUrl("not a url")).toBeNull();
		});

		test("handles trailing slashes", () => {
			const result = parseGithubUrl("https://github.com/user/repo/");
			expect(result).toEqual({ owner: "user", repo: "repo", branch: undefined });
		});

		test("handles whitespace", () => {
			const result = parseGithubUrl("  https://github.com/user/repo  ");
			expect(result).toEqual({ owner: "user", repo: "repo", branch: undefined });
		});
	});
});
