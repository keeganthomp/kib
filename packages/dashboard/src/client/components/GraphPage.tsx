import {
	forceCenter,
	forceCollide,
	forceLink,
	forceManyBody,
	forceSimulation,
	type SimulationNodeDatum,
} from "d3-force";
import { select } from "d3-selection";
import { zoom, zoomIdentity } from "d3-zoom";
import { useEffect, useRef, useState } from "react";
import { api, type GraphData } from "../api.js";

interface GraphNode extends SimulationNodeDatum {
	id: string;
	category: string;
	summary: string;
}

interface GraphLink {
	source: string | GraphNode;
	target: string | GraphNode;
}

const CATEGORY_COLORS: Record<string, string> = {
	concept: "#3b82f6",
	topic: "#22c55e",
	reference: "#f97316",
	output: "#a855f7",
};

export function GraphPage({
	onNavigateToArticle,
	revision = 0,
}: {
	onNavigateToArticle?: (slug: string) => void;
	revision?: number;
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const [data, setData] = useState<GraphData | null>(null);
	const [hovered, setHovered] = useState<GraphNode | null>(null);
	const [loading, setLoading] = useState(true);

	// biome-ignore lint/correctness/useExhaustiveDependencies: revision triggers re-fetch on vault changes
	useEffect(() => {
		api
			.getGraph()
			.then(setData)
			.finally(() => setLoading(false));
	}, [revision]);

	useEffect(() => {
		if (!data || !canvasRef.current) return;
		if (data.nodes.length === 0) return;

		const canvas = canvasRef.current;
		const ctx = canvas.getContext("2d");
		if (!ctx) return;

		const width = canvas.parentElement?.clientWidth ?? 800;
		const height = canvas.parentElement?.clientHeight ?? 600;
		canvas.width = width * devicePixelRatio;
		canvas.height = height * devicePixelRatio;
		canvas.style.width = `${width}px`;
		canvas.style.height = `${height}px`;
		ctx.scale(devicePixelRatio, devicePixelRatio);

		const nodes: GraphNode[] = data.nodes.map((n) => ({ ...n }));
		const links: GraphLink[] = data.edges.map((e) => ({
			source: e.source,
			target: e.target,
		}));

		let currentTransform = zoomIdentity;

		const simulation = forceSimulation(nodes)
			.force(
				"link",
				forceLink<GraphNode, GraphLink>(links)
					.id((d) => d.id)
					.distance(80),
			)
			.force("charge", forceManyBody().strength(-200))
			.force("center", forceCenter(width / 2, height / 2))
			.force("collide", forceCollide(20));

		function draw() {
			if (!ctx) return;
			ctx.save();
			ctx.clearRect(0, 0, width, height);

			ctx.translate(currentTransform.x, currentTransform.y);
			ctx.scale(currentTransform.k, currentTransform.k);

			// Draw edges
			ctx.strokeStyle = "#e0e0e0";
			ctx.lineWidth = 1;
			for (const link of links) {
				const source = link.source as GraphNode;
				const target = link.target as GraphNode;
				if (source.x == null || source.y == null || target.x == null || target.y == null) continue;
				ctx.beginPath();
				ctx.moveTo(source.x, source.y);
				ctx.lineTo(target.x, target.y);
				ctx.stroke();
			}

			// Draw nodes
			for (const node of nodes) {
				if (node.x == null || node.y == null) continue;
				const radius = 6 + Math.min(node.id.length * 0.3, 6);
				const color = CATEGORY_COLORS[node.category] ?? "#888";

				ctx.beginPath();
				ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
				ctx.fillStyle = color;
				ctx.fill();

				// Label
				ctx.fillStyle = "#333";
				ctx.font = "10px JetBrains Mono, monospace";
				ctx.textAlign = "center";
				ctx.fillText(node.id, node.x, node.y + radius + 12);
			}

			ctx.restore();
		}

		simulation.on("tick", draw);

		// Zoom
		const zoomBehavior = zoom<HTMLCanvasElement, unknown>()
			.scaleExtent([0.2, 5])
			.on("zoom", (event) => {
				currentTransform = event.transform;
				draw();
			});

		select(canvas).call(zoomBehavior);

		// Hover detection
		const handleMouseMove = (e: MouseEvent) => {
			const rect = canvas.getBoundingClientRect();
			const mx = (e.clientX - rect.left - currentTransform.x) / currentTransform.k;
			const my = (e.clientY - rect.top - currentTransform.y) / currentTransform.k;

			let found: GraphNode | null = null;
			for (const node of nodes) {
				if (node.x == null || node.y == null) continue;
				const dx = mx - node.x;
				const dy = my - node.y;
				if (dx * dx + dy * dy < 200) {
					found = node;
					break;
				}
			}
			setHovered(found);
			canvas.style.cursor = found ? "pointer" : "default";
		};

		const handleClick = (e: MouseEvent) => {
			const rect = canvas.getBoundingClientRect();
			const mx = (e.clientX - rect.left - currentTransform.x) / currentTransform.k;
			const my = (e.clientY - rect.top - currentTransform.y) / currentTransform.k;

			for (const node of nodes) {
				if (node.x == null || node.y == null) continue;
				const dx = mx - node.x;
				const dy = my - node.y;
				if (dx * dx + dy * dy < 200) {
					onNavigateToArticle?.(node.id);
					break;
				}
			}
		};

		canvas.addEventListener("mousemove", handleMouseMove);
		canvas.addEventListener("click", handleClick);

		return () => {
			simulation.stop();
			canvas.removeEventListener("mousemove", handleMouseMove);
			canvas.removeEventListener("click", handleClick);
		};
	}, [data, onNavigateToArticle]);

	if (loading) {
		return (
			<div className="p-8">
				<p className="text-sm text-[var(--color-muted)]">Loading graph...</p>
			</div>
		);
	}

	if (!data || data.nodes.length === 0) {
		return (
			<div className="p-8">
				<h2 className="text-xl font-semibold mb-4">Knowledge Graph</h2>
				<p className="text-sm text-[var(--color-muted)]">
					No graph data yet. Compile some sources to build connections.
				</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			<div className="p-4 border-b flex items-center justify-between">
				<h2 className="text-lg font-semibold">Knowledge Graph</h2>
				<div className="flex items-center gap-4 text-xs text-[var(--color-muted)]">
					{Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
						<div key={cat} className="flex items-center gap-1.5">
							<span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
							{cat}
						</div>
					))}
				</div>
			</div>
			<div className="flex-1 relative">
				<canvas ref={canvasRef} className="w-full h-full" />
				{hovered && (
					<div className="absolute bottom-4 left-4 bg-white border rounded-lg p-3 shadow-sm max-w-xs">
						<p className="text-sm font-medium">{hovered.id}</p>
						<p className="text-xs text-[var(--color-muted)]">{hovered.category}</p>
						{hovered.summary && (
							<p className="text-xs text-[var(--color-muted)] mt-1">{hovered.summary}</p>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
