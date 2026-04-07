import { cpSync, mkdirSync } from "node:fs";
import path from "node:path";

const src = path.resolve(import.meta.dir, "src");
const dist = path.resolve(import.meta.dir, "dist");

mkdirSync(dist, { recursive: true });

// Bundle content script (includes Readability + Turndown)
await Bun.build({
	entrypoints: [path.join(src, "content.ts")],
	outdir: dist,
	target: "browser",
	format: "iife",
	minify: true,
});

// Bundle popup script
await Bun.build({
	entrypoints: [path.join(src, "popup.ts")],
	outdir: dist,
	target: "browser",
	format: "iife",
	minify: true,
});

// Bundle background service worker
await Bun.build({
	entrypoints: [path.join(src, "background.ts")],
	outdir: dist,
	target: "browser",
	format: "iife",
	minify: true,
});

// Copy static files
cpSync(path.join(src, "popup.html"), path.join(dist, "popup.html"));
cpSync(path.join(src, "popup.css"), path.join(dist, "popup.css"));
cpSync(path.resolve(import.meta.dir, "manifest.json"), path.join(dist, "manifest.json"));

// Generate icons programmatically (simple "K" lettermark PNGs)
await generateIcons(dist);

async function generateIcons(outDir: string) {
	const sizes = [16, 48, 128];
	const iconsOut = path.join(outDir, "icons");
	mkdirSync(iconsOut, { recursive: true });

	for (const size of sizes) {
		const svg = makeIconSvg(size);
		const outPath = path.join(iconsOut, `icon-${size}.png`);
		// Use resvg-js if available, otherwise write SVG as fallback
		try {
			const { Resvg } = await import("@resvg/resvg-js");
			const resvg = new Resvg(svg, { fitTo: { mode: "width", value: size } });
			const png = resvg.render().asPng();
			await Bun.write(outPath, png);
		} catch {
			// Fallback: write SVG (user can convert manually)
			await Bun.write(outPath.replace(".png", ".svg"), svg);
		}
	}
}

function makeIconSvg(size: number): string {
	const s = size;
	const fontSize = Math.round(s * 0.65);
	return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
  <rect width="${s}" height="${s}" rx="${Math.round(s * 0.2)}" fill="#111"/>
  <text x="50%" y="53%" dominant-baseline="middle" text-anchor="middle"
        font-family="-apple-system,BlinkMacSystemFont,system-ui,sans-serif"
        font-weight="700" font-size="${fontSize}" fill="#fff">k</text>
</svg>`;
}

console.log("Build complete → dist/");
