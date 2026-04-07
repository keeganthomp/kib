"use client";

import { createContext, type ReactNode, useContext, useState } from "react";
import { cn } from "@/lib/utils";

interface TabsContextType {
	activeTab: string;
	setActiveTab: (tab: string) => void;
}

const TabsContext = createContext<TabsContextType>({
	activeTab: "",
	setActiveTab: () => {},
});

export function Tabs({
	defaultValue,
	children,
	className,
}: {
	defaultValue: string;
	children: ReactNode;
	className?: string;
}) {
	const [activeTab, setActiveTab] = useState(defaultValue);
	return (
		<TabsContext.Provider value={{ activeTab, setActiveTab }}>
			<div className={className}>{children}</div>
		</TabsContext.Provider>
	);
}

export function TabsList({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div className={cn("inline-flex items-center gap-1 rounded-lg bg-card p-1", className)}>
			{children}
		</div>
	);
}

export function TabsTrigger({
	value,
	children,
	className,
}: {
	value: string;
	children: ReactNode;
	className?: string;
}) {
	const { activeTab, setActiveTab } = useContext(TabsContext);
	const isActive = activeTab === value;

	return (
		<button
			type="button"
			onClick={() => setActiveTab(value)}
			className={cn(
				"inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-all duration-150 cursor-pointer",
				isActive ? "bg-background text-foreground shadow-sm" : "text-muted hover:text-foreground",
				className,
			)}
		>
			{children}
		</button>
	);
}

/**
 * Both panels render in a grid stack (row-1/col-1) so they occupy the same space.
 * The active panel is visible; the inactive one is hidden but still in flow,
 * so the container height equals the tallest panel. No jump.
 */
export function TabsContent({
	value,
	children,
	className,
}: {
	value: string;
	children: ReactNode;
	className?: string;
}) {
	const { activeTab } = useContext(TabsContext);
	const isActive = activeTab === value;

	return (
		<div
			className={cn(
				"col-start-1 row-start-1 transition-opacity duration-200",
				isActive ? "opacity-100" : "pointer-events-none opacity-0",
				className,
			)}
		>
			{children}
		</div>
	);
}
