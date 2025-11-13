export const createModuleWorker = (
	entry: string | URL,
	options: WorkerOptions = {}
): Worker => {
	const targetUrl = typeof entry === 'string' ? entry : entry.toString();
	const bootstrapSource = `
(() => {
	const targetUrl = ${JSON.stringify(targetUrl)};
	const pendingMessages = [];
	let drained = false;

	const queueMessage = (event) => {
		pendingMessages.push({
			data: event.data,
			origin: event.origin,
			lastEventId: event.lastEventId || '',
			ports:
				event.ports && event.ports.length
					? Array.from(event.ports)
					: undefined,
			source: event.source || null,
		});
		if (typeof event.stopImmediatePropagation === 'function') {
			event.stopImmediatePropagation();
		}
	};

	self.addEventListener('message', queueMessage, true);

	const flushQueuedMessages = () => {
		if (drained) {
			return;
		}
		drained = true;
		self.removeEventListener('message', queueMessage, true);
		for (const queued of pendingMessages) {
			self.dispatchEvent(
				new MessageEvent('message', {
					data: queued.data,
					origin: queued.origin,
					lastEventId: queued.lastEventId,
					ports: queued.ports,
					source: queued.source,
				})
			);
		}
		pendingMessages.length = 0;
	};

	const forwardError = (error) => {
		const message =
			error && typeof error.message === 'string'
				? error.message
				: String(error ?? 'Failed to load worker module');
		self.dispatchEvent(new ErrorEvent('error', { message, error }));
	};

	(async () => {
		try {
			await import(targetUrl);
			flushQueuedMessages();
		} catch (error) {
			flushQueuedMessages();
			forwardError(error);
		}
	})();
})();
`;

	const blob = new Blob([bootstrapSource], {
		type: 'application/javascript',
	});
	const blobUrl = URL.createObjectURL(blob);
	const workerOptions: WorkerOptions = {
		...options,
		type: 'classic',
	};
	const RealWorker: typeof Worker =
		typeof globalThis !== 'undefined' &&
		(globalThis as unknown as { RealWorker?: typeof Worker }).RealWorker
			? (globalThis as unknown as { RealWorker?: typeof Worker })
					.RealWorker!
			: Worker;
	try {
		return new RealWorker(blobUrl, workerOptions);
	} finally {
		URL.revokeObjectURL(blobUrl);
	}
};
