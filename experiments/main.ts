import {
	receiveMessageOnPort,
	tryReceiveMessageOnPort,
	closeSyncReceive,
} from './sync-receive.js'

// DOM elements
const statusDiv = document.getElementById('status') as HTMLDivElement
const logPre = document.getElementById('log') as HTMLPreElement
const checkSupportBtn = document.getElementById(
	'checkSupport'
) as HTMLButtonElement
const runTestBtn = document.getElementById('runTest') as HTMLButtonElement
const clearLogBtn = document.getElementById('clearLog') as HTMLButtonElement

// Logging utility
function log(message: string, type: 'info' | 'success' | 'error' = 'info') {
	const timestamp = new Date().toISOString().split('T')[1].split('.')[0]
	logPre.textContent += `[${timestamp}] ${message}\n`
	logPre.scrollTop = logPre.scrollHeight
	console.log(message)
}

function setStatus(message: string, type: 'success' | 'error' | 'info') {
	statusDiv.innerHTML = `<div class="${type}">${message}</div>`
}

// Check browser support
function checkBrowserSupport(): boolean {
	const issues: string[] = []

	// Check SharedArrayBuffer
	if (typeof SharedArrayBuffer === 'undefined') {
		issues.push('SharedArrayBuffer is not available')
	}

	// Check cross-origin isolation
	if (!(self as any).crossOriginIsolated) {
		issues.push('Cross-origin isolation is not enabled')
	}

	// Check Worker support
	if (typeof Worker === 'undefined') {
		issues.push('Web Workers are not supported')
	}

	// Check Atomics
	if (typeof Atomics === 'undefined') {
		issues.push('Atomics are not supported')
	}

	if (issues.length > 0) {
		setStatus(`Browser support issues: ${issues.join(', ')}`, 'error')
		log(
			`[main] Browser support check failed: ${issues.join(', ')}`,
			'error'
		)
		return false
	} else {
		setStatus(
			'[main] All required browser features are supported!',
			'success'
		)
		log('[main] Browser support check passed', 'success')
		return true
	}
}

// Test the sync receive functionality
async function runSyncReceiveTest() {
	try {
		// Create a MessageChannel
		const { port1, port2 } = new MessageChannel()

		log('[main] Created MessageChannel', 'info')

		// Create a worker to test the sync receive
		const worker = new Worker(
			new URL('./sync-receive.ts', import.meta.url),
			{ type: 'module', name: 'sync-receive', credentials: 'include' }
		)
		console.log({ worker })

		log('[main] Created test worker', 'info')

		// Set up worker message handling
		worker.onmessage = (e) => {
			const { type, message, error } = e.data

			switch (type) {
				case 'ready':
					log(
						'[main] Worker is ready, sending test message...',
						'info'
					)
					// Send a test message through port2
					setTimeout(() => {
						port2.postMessage({
							test: 'Hello from main thread!',
							timestamp: Date.now(),
						})
						log('[main] Sent test message', 'info')
					}, 100)
					break

				case 'received':
					log(
						`[main] Worker received message: ${JSON.stringify(
							message
						)}`,
						'success'
					)
					setStatus(
						'[main] Sync receive test completed successfully!',
						'success'
					)
					worker.terminate()
					break

				case 'timeout':
					log('[main] Worker timed out waiting for message', 'error')
					setStatus('[main] Test timed out', 'error')
					worker.terminate()
					break

				case 'error':
					console.log({ e })
					log(`[main] Worker error: ${error}`, 'error')
					setStatus(`[main] Test failed: ${error}`, 'error')
					worker.terminate()
					break
			}
		}

		worker.onerror = (error) => {
			console.log('bad', { error })
			log(`[main] Worker error: ${error.message}`, 'error')
			setStatus(`[main] Worker error: ${error.message}`, 'error')
		}

		// Transfer port1 to the worker
		worker.postMessage({ port: port1 }, [port1])
	} catch (error) {
		console.log('catch', { error })
		log(`[main] Test setup error: ${error.message}`, 'error')
		setStatus(`[main] Test setup error: ${error.message}`, 'error')
	}
}

// Event listeners
checkBrowserSupport()
runSyncReceiveTest()
// Initial setup
log('[main] Web Polyfills Sync Receive Experiment loaded', 'info')
log('[main] Click "Check Browser Support" to begin', 'info')
