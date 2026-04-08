import { z } from "zod";

export const SkillInputSchema = z.enum(["wiki", "raw", "vault", "selection", "index", "none"]);

export const SkillOutputSchema = z.enum(["articles", "report", "mutations", "stdout", "none"]);

export const SkillHookSchema = z.enum(["post-compile", "post-ingest", "post-lint"]);

export const SkillDefinitionSchema = z.object({
	name: z.string().min(1),
	version: z.string().default("1.0.0"),
	description: z.string().min(1),
	author: z.string().optional(),

	input: SkillInputSchema,
	output: SkillOutputSchema,

	dependencies: z.array(z.string()).optional(),
	hooks: z.array(SkillHookSchema).optional(),
	category: z.string().optional(),

	llm: z
		.object({
			required: z.boolean().default(true),
			model: z.enum(["default", "fast"]).default("default"),
			systemPrompt: z.string(),
			maxTokens: z.number().int().positive().optional(),
			temperature: z.number().min(0).max(2).optional(),
		})
		.optional(),
});

/** Schema for skill.json manifest in installed skill packages */
export const SkillPackageSchema = z.object({
	name: z.string().min(1),
	version: z.string().default("1.0.0"),
	description: z.string().min(1),
	author: z.string().optional(),
	main: z.string().default("index.ts"),
	dependencies: z.array(z.string()).optional(),
});

/** Schema for skills section in vault config.toml */
export const SkillConfigSchema = z.object({
	hooks: z
		.object({
			"post-compile": z.array(z.string()).default([]),
			"post-ingest": z.array(z.string()).default([]),
			"post-lint": z.array(z.string()).default([]),
		})
		.default({}),
	config: z.record(z.string(), z.record(z.string(), z.unknown())).default({}),
});

export type SkillInput = z.infer<typeof SkillInputSchema>;
export type SkillOutput = z.infer<typeof SkillOutputSchema>;
export type SkillHook = z.infer<typeof SkillHookSchema>;
export type SkillPackage = z.infer<typeof SkillPackageSchema>;
export type SkillConfig = z.infer<typeof SkillConfigSchema>;
