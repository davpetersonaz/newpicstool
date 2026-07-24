// src/utils/configCache.js
const cache = new Map();

export function getCachedConfig(siteSlug) {
	return cache.get(siteSlug) || null;
}

export function setCachedConfig(siteSlug, config) {
	cache.set(siteSlug, config);
}

export function invalidateConfig(siteSlug) {
	cache.delete(siteSlug);
}

// Optional: clear everything (useful in development)
export function clearConfigCache() {
	cache.clear();
}