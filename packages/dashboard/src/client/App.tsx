import { useCallback, useEffect, useState } from "react";
import { api } from "./api.js";
import { BrowsePage } from "./components/BrowsePage.js";
import { GraphPage } from "./components/GraphPage.js";
import { IngestPage } from "./components/IngestPage.js";
import { QueryPage } from "./components/QueryPage.js";
import { SearchPage } from "./components/SearchPage.js";
import { type Page, Shell } from "./components/Shell.js";
import { StatusPage } from "./components/StatusPage.js";
import { useEvents } from "./useEvents.js";

export function App() {
	const [page, setPage] = useState<Page>("status");
	const [vaultPath, setVaultPath] = useState<string>();
	const { revision, lastEvent } = useEvents();

	// biome-ignore lint/correctness/useExhaustiveDependencies: revision triggers re-fetch on vault changes
	useEffect(() => {
		api
			.getStatus()
			.then((s) => setVaultPath(s.root))
			.catch(() => {});
	}, [revision]);

	const handleNavigateToArticle = useCallback((_path: string) => {
		setPage("browse");
	}, []);

	return (
		<Shell currentPage={page} onNavigate={setPage} vaultPath={vaultPath} lastEvent={lastEvent}>
			{page === "status" && <StatusPage revision={revision} lastEvent={lastEvent} />}
			{page === "browse" && <BrowsePage revision={revision} />}
			{page === "search" && <SearchPage onNavigateToArticle={handleNavigateToArticle} />}
			{page === "query" && <QueryPage />}
			{page === "graph" && (
				<GraphPage onNavigateToArticle={handleNavigateToArticle} revision={revision} />
			)}
			{page === "ingest" && <IngestPage />}
		</Shell>
	);
}
