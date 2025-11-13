/**
 * Worker URL configuration
 *
 * In production (npm package), workers are bundled in dist/workers/
 * In development (with Vite), workers are loaded from source using import.meta.url
 *
 * Users can override these URLs if they need custom worker locations.
 */

export interface WorkerConfig {
	processController: string | URL;
	pumpWorker: string | URL;
	wasmfsWorker: string | URL;
}

// Default configuration - tries to use bundled workers from dist/
// This will be set correctly when building for npm distribution
let workerConfig: WorkerConfig | null = null;

/**
 * Set custom worker URLs (optional)
 * Call this before creating the kernel if you need to override worker locations
 */
export function setWorkerConfig(config: Partial<WorkerConfig>): void {
	workerConfig = {
		...getDefaultWorkerConfig(),
		...config,
	};
}

/**
 * Get current worker configuration
 */
export function getWorkerConfig(): WorkerConfig {
	if (!workerConfig) {
		workerConfig = getDefaultWorkerConfig();
	}
	return workerConfig;
}

function getDefaultWorkerConfig(): WorkerConfig {
	// Try to determine if we're in a bundled environment or development
	// In bundled code, workers are in dist/workers/
	// This is a reasonable default that works when the package is published
	let baseUrl = new URL('.', import.meta.url);
	// TODO: Move this worker-config elsewhere. Don't assume any specific build structure
	//       at the kernel level.
	if (baseUrl.pathname.includes('/workers/')) {
		baseUrl = new URL('../', baseUrl);
	}

	return {
		processController: new URL('workers/process-controller.js', baseUrl),
		pumpWorker: new URL('workers/pump-worker.js', baseUrl),
		wasmfsWorker: new URL('workers/wasmfs-worker.js', baseUrl),
	};
}
