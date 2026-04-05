import { z } from "zod";

export const SkillInputSchema = z.enum([
	"wiki",
	"raw",
	"vault",
	"selection",
	"index",
	"none",
]);

export const SkillOutputSchema = z.enum([
	"articles",
	"report",
	"mutations",
	"stdout",
	"none",
]);

export const SkillDefinitionSchema = z.object({
	name: z.string().min(1),
	version: z.string().default("1.0.0"),
	description: z.string().min(1),
	author: z.string().optional(),

	input: SkillInputSchema,
	output: SkillOutputSchema,

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

export type SkillInput = z.infer<typeof SkillInputSchema>;
export type SkillOutput = z.infer<typeof SkillOutputSchema>;
