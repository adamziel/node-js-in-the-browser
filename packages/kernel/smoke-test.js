#!/usr/bin/env node

/**
 * Smoke test runner for the kernel build
 * Runs the smoke-test.html in a headless browser using Playwright
 */

import { chromium } from 'playwright'
import { fileURLToPath } from 'url'
import { dirname, resolve } from 'path'
import { createServer } from 'http'
import { readFile } from 'fs/promises'
import { URL } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

// Simple static file server
function createStaticServer(rootDir) {
	return createServer(async (req, res) => {
		try {
			const url = new URL(req.url, `http://${req.headers.host}`)
			let filePath = url.pathname === '/' ? '/smoke-test.html' : url.pathname

			// Security: prevent directory traversal
			if (filePath.includes('..')) {
				res.writeHead(400)
				res.end('Bad request')
				return
			}

			const fullPath = resolve(rootDir, filePath.slice(1))

			// Set appropriate content type
			let contentType = 'text/html'
			if (filePath.endsWith('.js')) {
				contentType = 'application/javascript'
			} else if (filePath.endsWith('.wasm')) {
				contentType = 'application/wasm'
			} else if (filePath.endsWith('.json')) {
				contentType = 'application/json'
			}

			// Add CORS headers needed for SharedArrayBuffer
			res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
			res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
			res.setHeader('Content-Type', contentType)

			const content = await readFile(fullPath)
			res.writeHead(200)
			res.end(content)
		} catch (error) {
			console.error('Error serving file:', error.message)
			res.writeHead(404)
			res.end('Not found')
		}
	})
}

async function runSmokeTest() {
	console.log('🧪 Starting kernel smoke test...\n')

	// Start server
	const server = createStaticServer(__dirname)
	const port = 3456

	await new Promise((resolve) => {
		server.listen(port, resolve)
	})

	console.log(`📡 Server started on http://localhost:${port}`)

	let browser
	let testPassed = false

	try {
		// Launch browser
		browser = await chromium.launch({
			headless: true,
		})

		const context = await browser.newContext()
		const page = await context.newPage()

		// Collect console logs
		page.on('console', (msg) => {
			const type = msg.type()
			const text = msg.text()

			if (type === 'error') {
				console.error('❌ Browser error:', text)
			} else if (text.includes('Test') || text.includes('Smoke')) {
				console.log(`   ${text}`)
			}
		})

		// Collect errors
		page.on('pageerror', (error) => {
			console.error('❌ Page error:', error.message)
		})

		// Navigate to test page
		console.log('\n🌐 Loading smoke test page...\n')
		await page.goto(`http://localhost:${port}/smoke-test.html`, {
			waitUntil: 'domcontentloaded',
			timeout: 60000
		})

		// Wait for tests to complete (look for the summary div to be populated)
		// Increased timeout to 60 seconds for worker tests
		await page.waitForFunction(
			() => {
				const summary = document.getElementById('summary')
				return summary && summary.textContent.trim() !== ''
			},
			{ timeout: 60000 }
		)

		// Get test results
		const summaryText = await page.textContent('#summary')
		const hasPassed = summaryText.includes('ALL TESTS PASSED')

		console.log('\n' + '='.repeat(60))
		console.log(summaryText.trim())
		console.log('='.repeat(60) + '\n')

		// Get detailed output
		const testOutput = await page.evaluate(() => {
			const tests = Array.from(document.querySelectorAll('.test'))
			return tests.map((test) => {
				const className = test.className
				const text = test.textContent
				return { className, text: text.trim() }
			})
		})

		// Print test details
		testOutput.forEach(({ className, text }) => {
			const icon = className.includes('pass')
				? '✓'
				: className.includes('fail')
					? '✗'
					: '○'
			console.log(`${icon} ${text}\n`)
		})

		testPassed = hasPassed

		if (testPassed) {
			console.log('✅ Smoke test PASSED!\n')
		} else {
			console.error('❌ Smoke test FAILED!\n')
		}
	} catch (error) {
		console.error('❌ Error running smoke test:', error.message)
		console.error(error.stack)
		testPassed = false
	} finally {
		// Cleanup
		if (browser) {
			await browser.close()
		}
		server.close()
	}

	process.exit(testPassed ? 0 : 1)
}

// Run the test
runSmokeTest()
