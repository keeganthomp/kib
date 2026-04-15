import {
	BookOpen,
	Compass,
	LayoutDashboard,
	type LucideIcon,
	MessageSquare,
	Plus,
	Search,
	X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import type { VaultEvent } from "../useEvents.js";

export type Page = "status" | "browse" | "search" | "query" | "graph" | "ingest";

interface NavItem {
	page: Page;
	label: string;
	icon: LucideIcon;
	shortcut?: string;
}

const NAV_ITEMS: NavItem[] = [
	{ page: "status", label: "Dashboard", icon: LayoutDashboard, shortcut: "1" },
	{ page: "browse", label: "Browse", icon: BookOpen, shortcut: "2" },
	{ page: "search", label: "Search", icon: Search, shortcut: "3" },
	{ page: "query", label: "Query", icon: MessageSquare, shortcut: "4" },
	{ page: "graph", label: "Graph", icon: Compass, shortcut: "5" },
	{ page: "ingest", label: "Ingest", icon: Plus, shortcut: "6" },
];

interface ShellProps {
	currentPage: Page;
	onNavigate: (page: Page) => void;
	vaultPath?: string;
	lastEvent?: VaultEvent | null;
	children: ReactNode;
}

interface Toast {
	id: number;
	message: string;
	leaving: boolean;
}

let toastId = 0;

export function Shell({ currentPage, onNavigate, vaultPath, lastEvent, children }: ShellProps) {
	const [toasts, setToasts] = useState<Toast[]>([]);
	const pageRef = useRef<Page>(currentPage);
	const [animating, setAnimating] = useState(false);

	// Page transition
	useEffect(() => {
		if (currentPage !== pageRef.current) {
			pageRef.current = currentPage;
			setAnimating(true);
			const timer = setTimeout(() => setAnimating(false), 150);
			return () => clearTimeout(timer);
		}
	}, [currentPage]);

	// Toast events
	useEffect(() => {
		if (!lastEvent) return;
		let message: string | null = null;
		if (lastEvent.type === "ingest") {
			message = `Ingested ${lastEvent.title}`;
		} else if (lastEvent.type === "compile_done") {
			message = `Compiled ${lastEvent.articlesCreated} article${lastEvent.articlesCreated !== 1 ? "s" : ""}`;
		} else if (lastEvent.type === "compile_article") {
			message = `${lastEvent.op === "create" ? "Created" : "Updated"} ${lastEvent.title}`;
		}
		if (!message) return;

		const id = ++toastId;
		setToasts((prev) => [...prev.slice(-2), { id, message: message!, leaving: false }]);

		setTimeout(() => {
			setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
			setTimeout(() => {
				setToasts((prev) => prev.filter((t) => t.id !== id));
			}, 150);
		}, 2800);
	}, [lastEvent]);

	// Keyboard shortcuts
	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			// Don't trigger shortcuts when typing in inputs
			const tag = (e.target as HTMLElement).tagName;
			if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

			// Number keys for nav
			const num = Number.parseInt(e.key, 10);
			if (num >= 1 && num <= NAV_ITEMS.length) {
				onNavigate(NAV_ITEMS[num - 1].page);
				return;
			}

			// Cmd+K for search
			if ((e.metaKey || e.ctrlKey) && e.key === "k") {
				e.preventDefault();
				onNavigate("search");
			}
		};
		window.addEventListener("keydown", handleKey);
		return () => window.removeEventListener("keydown", handleKey);
	}, [onNavigate]);

	const dismissToast = (id: number) => {
		setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
		setTimeout(() => {
			setToasts((prev) => prev.filter((t) => t.id !== id));
		}, 150);
	};

	const vaultName = vaultPath?.split("/").pop() ?? "";

	return (
		<div className="flex h-screen">
			{/* Sidebar */}
			<nav className="w-52 flex-shrink-0 bg-[#111] text-white/70 flex flex-col">
				<div className="px-5 pt-5 pb-4">
					<div className="flex items-center gap-2">
						<span className="text-[13px] font-semibold text-white tracking-tight">kib</span>
						{vaultName && (
							<>
								<span className="text-white/20">/</span>
								<span className="text-[11px] text-white/40 truncate" title={vaultPath}>
									{vaultName}
								</span>
							</>
						)}
					</div>
				</div>

				<div className="flex-1 px-2 space-y-0.5">
					{NAV_ITEMS.map(({ page, label, icon: Icon, shortcut }) => {
						const active = currentPage === page;
						return (
							<button
								key={page}
								type="button"
								onClick={() => onNavigate(page)}
								className={`w-full flex items-center gap-2.5 px-3 py-1.5 text-[12px] rounded-md transition-colors ${
									active
										? "bg-white/10 text-white"
										: "text-white/40 hover:bg-white/[0.04] hover:text-white/70"
								}`}
							>
								<Icon size={14} strokeWidth={active ? 2 : 1.5} />
								<span className="flex-1 text-left">{label}</span>
								{shortcut && <span className="text-[9px] text-white/20 font-mono">{shortcut}</span>}
							</button>
						);
					})}
				</div>

				<div className="px-5 py-3 text-[9px] text-white/15">
					<span className="tracking-wide">kib v1.1.0</span>
				</div>
			</nav>

			{/* Main content */}
			<main className="flex-1 overflow-y-auto relative bg-[#fafafa]">
				<div className={animating ? "animate-page-in" : ""}>{children}</div>

				{/* Toast stack */}
				{toasts.length > 0 && (
					<div className="absolute bottom-5 right-5 flex flex-col gap-2">
						{toasts.map((toast) => (
							<div
								key={toast.id}
								className={`flex items-center gap-2 bg-[#111] text-white/80 text-[11px] pl-3 pr-2 py-2 rounded-lg shadow-lg ${
									toast.leaving ? "animate-fade-out" : "animate-fade-in"
								}`}
							>
								<span className="truncate max-w-[240px]">{toast.message}</span>
								<button
									type="button"
									onClick={() => dismissToast(toast.id)}
									className="text-white/30 hover:text-white/60 p-0.5 flex-shrink-0"
								>
									<X size={10} />
								</button>
							</div>
						))}
					</div>
				)}
			</main>
		</div>
	);
}
