import {
	BookOpen,
	Compass,
	LayoutDashboard,
	type LucideIcon,
	MessageSquare,
	Plus,
	Search,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import type { VaultEvent } from "../useEvents.js";

export type Page = "status" | "browse" | "search" | "query" | "graph" | "ingest";

interface NavItem {
	page: Page;
	label: string;
	icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
	{ page: "status", label: "Dashboard", icon: LayoutDashboard },
	{ page: "browse", label: "Browse", icon: BookOpen },
	{ page: "search", label: "Search", icon: Search },
	{ page: "query", label: "Query", icon: MessageSquare },
	{ page: "graph", label: "Graph", icon: Compass },
	{ page: "ingest", label: "Ingest", icon: Plus },
];

interface ShellProps {
	currentPage: Page;
	onNavigate: (page: Page) => void;
	vaultPath?: string;
	lastEvent?: VaultEvent | null;
	children: ReactNode;
}

export function Shell({ currentPage, onNavigate, vaultPath, lastEvent, children }: ShellProps) {
	const [toast, setToast] = useState<string | null>(null);

	useEffect(() => {
		if (!lastEvent) return;
		if (lastEvent.type === "ingest") {
			setToast(`Ingested: ${lastEvent.title}`);
		} else if (lastEvent.type === "compile_done") {
			setToast(`Compiled: ${lastEvent.articlesCreated} articles created`);
		} else if (lastEvent.type === "compile_article") {
			setToast(`${lastEvent.op === "create" ? "Created" : "Updated"}: ${lastEvent.title}`);
		}
		const timer = setTimeout(() => setToast(null), 3000);
		return () => clearTimeout(timer);
	}, [lastEvent]);

	return (
		<div className="flex h-screen">
			{/* Sidebar */}
			<nav className="w-56 flex-shrink-0 bg-[var(--color-sidebar)] text-[var(--color-sidebar-fg)] flex flex-col">
				<div className="p-4 border-b border-white/10">
					<h1 className="text-lg font-semibold tracking-tight font-[family-name:var(--font-mono)]">
						kib
					</h1>
					{vaultPath && (
						<p className="text-xs text-white/40 mt-0.5 truncate" title={vaultPath}>
							{vaultPath}
						</p>
					)}
				</div>

				<div className="flex-1 py-2">
					{NAV_ITEMS.map(({ page, label, icon: Icon }) => {
						const active = currentPage === page;
						return (
							<button
								key={page}
								type="button"
								onClick={() => onNavigate(page)}
								className={`w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors ${
									active
										? "bg-[var(--color-sidebar-active)] text-white"
										: "text-white/60 hover:bg-[var(--color-sidebar-hover)] hover:text-white/90"
								}`}
							>
								<Icon size={16} />
								{label}
							</button>
						);
					})}
				</div>

				<div className="p-4 border-t border-white/10 text-[10px] text-white/30">kib dashboard</div>
			</nav>

			{/* Main content */}
			<main className="flex-1 overflow-y-auto relative">
				{children}

				{/* Toast notification */}
				{toast && (
					<div className="absolute bottom-4 right-4 bg-[var(--color-sidebar)] text-white text-sm px-4 py-2.5 rounded-lg shadow-lg animate-fade-in">
						{toast}
					</div>
				)}
			</main>
		</div>
	);
}
