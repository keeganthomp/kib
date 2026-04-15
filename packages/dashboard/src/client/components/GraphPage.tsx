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

			// Edges
			ctx.strokeStyle = "#e8e8e8";
			ctx.lineWidth = 0.5;
			for (const link of links) {
				const source = link.source as GraphNode;
				const target = link.target as GraphNode;
				if (source.x == null || source.y == null || target.x == null || target.y == null)
					continue;
				ctx.beginPath();
				ctx.moveTo(source.x, source.y);
				ctx.lineTo(target.x, target.y);
				ctx.stroke();
			}

			// Nodes
			for (const node of nodes) {
				if (node.x == null || node.y == null) continue;
				const radius = 4 + Math.min(node.id.length * 0.25, 4);
				const color = CATEGORY_COLORS[node.category] ?? "#999";
				const isHovered = hovered?.id === node.id;

				ctx.beginPath();
				ctx.arc(node.x, node.y, isHovered ? radius + 2 : radius, 0, Math.PI * 2);
				ctx.fillStyle = isHovered ? color : `${color}cc`;
				ctx.fill();

				// Label
				ctx.fillStyle = "#666";
				ctx.font = `${isHovered ? "11" : "9"}px JetBrains Mono, monospace`;
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

		// Hover
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
			<div className="flex items-center justify-center h-full">
				<p className="text-xs text-[#999]">Loading graph...</p>
			</div>
		);
	}

	if (!data || data.nodes.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center h-full animate-page-in">
				<div className="w-16 h-16 rounded-full bg-[#f5f5f5] flex items-center justify-center mb-4">
					<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5">
						<circle cx="6" cy="6" r="2" />
						<circle cx="18" cy="6" r="2" />
						<circle cx="12" cy="18" r="2" />
						<line x1="8" y1="6" x2="16" y2="6" />
						<line x1="7" y1="8" x2="11" y2="16" />
						<line x1="17" y1="8" x2="13" y2="16" />
					</svg>
				</div>
				<p className="text-xs text-[#999]">No graph data yet</p>
				<p className="text-[11px] text-[#ccc] mt-1">Compile sources to build connections</p>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full">
			<div className="px-6 py-4 border-b flex items-center justify-between">
				<h2 className="text-sm font-semibold tracking-tight">Knowledge Graph</h2>
				<div className="flex items-center gap-4 text-[10px] text-[#999]">
					{Object.entries(CATEGORY_COLORS).map(([cat, color]) => (
						<div key={cat} className="flex items-center gap-1.5">
							<span
								className="w-2 h-2 rounded-full"
								style={{ backgroundColor: color }}
							/>
							{cat}
						</div>
					))}
				</div>
			</div>
			<div className="flex-1 relative">
				<canvas ref={canvasRef} className="w-full h-full" />
				{hovered && (
					<div className="absolute bottom-4 left-4 bg-white border rounded-lg px-3 py-2.5 shadow-sm max-w-xs animate-fade-in">
						<p className="text-xs font-medium">{hovered.id}</p>
						<p className="text-[10px] text-[#999]">{hovered.category}</p>
						{hovered.summary && (
							<p className="text-[10px] text-[#999] mt-1 line-clamp-2">
								{hovered.summary}
							</p>
						)}
					</div>
				)}
			</div>
		</div>
	);
}
