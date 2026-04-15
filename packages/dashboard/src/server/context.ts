import {
	createProvider,
	type LLMProvider,
	loadConfig,
	loadManifest,
	type Manifest,
	SearchIndex,
	type VaultConfig,
} from "@kibhq/core";

export interface DashboardContext {
	root: string;
	getConfig(): Promise<VaultConfig>;
	getManifest(): Promise<Manifest>;
	getProvider(): Promise<LLMProvider>;
	getSearchIndex(): Promise<SearchIndex>;
	invalidateSearch(): void;
}

export function createContext(root: string): DashboardContext {
	let cachedConfig: VaultConfig | null = null;
	let cachedProvider: LLMProvider | null = null;
	let cachedIndex: SearchIndex | null = null;

	return {
		root,
		async getConfig() {
			if (!cachedConfig) cachedConfig = await loadConfig(root);
			return cachedConfig;
		},
		async getManifest() {
			return loadManifest(root);
		},
		async getProvider() {
			if (!cachedProvider) {
				const config = await this.getConfig();
				cachedProvider = await createProvider(config.provider.default, config.provider.model);
			}
			return cachedProvider;
		},
		async getSearchIndex() {
			if (!cachedIndex) {
				cachedIndex = new SearchIndex();
				const loaded = await cachedIndex.load(root);
				if (!loaded) {
					await cachedIndex.build(root, "all");
					await cachedIndex.save(root);
				}
			}
			return cachedIndex;
		},
		invalidateSearch() {
			cachedIndex = null;
		},
	};
}
