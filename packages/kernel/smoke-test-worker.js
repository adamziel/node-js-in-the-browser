// Dedicated test worker for running kernel operations
// This worker runs in a context where Atomics.wait() is allowed

let testResults = [];

function log(message, data = null) {
	const result = { message, data, timestamp: Date.now() };
	testResults.push(result);
	self.postMessage({ type: 'log', ...result });
}

async function runKernelTests() {
	try {
		// Test 1: Import kernel
		log('Importing kernel from dist/index.js...');
		const { Kernel, installBusybox } = await import('./dist/index.js');
		log('✓ Kernel imported successfully');

		// Test 2: Create kernel instance
		log('Creating Kernel instance...');
		let kernel;
		try {
			kernel = new Kernel();
			log('✓ Kernel instance created');
			log('Kernel filesystem preference: ' + kernel.getFsConnectorPreference());
		} catch (error) {
			log('✗ Failed to create Kernel instance: ' + error.message);
			throw error;
		}

		// Test 3: Check initial filesystem
		log('Checking filesystem: ls /');
		const rootFiles = kernel.readdirSync('/');
		log('✓ Root directory contents: ' + rootFiles.join(', '));

		// Install busybox for later tests
		log('Installing busybox...');
		installBusybox(kernel);
		log('✓ Busybox installed');

		// Test 4: Create directory - mkdir /home/test
		log('Creating directory: /home/test');
		kernel.mkdirSync('/home', { recursive: true });
		kernel.mkdirSync('/home/test', { recursive: true });
		log('✓ Created /home/test');

		// Test 5: Write file - echo "hello" > /home/test/test.txt
		log('Writing file: /home/test/test.txt');
		kernel.writeFileSync('/home/test/test.txt', 'hello\n');
		log('✓ File written successfully');

		// Test 6: Verify file exists and content
		log('Reading /home/test/test.txt');
		const content = kernel.readFileSync('/home/test/test.txt', 'utf8');

		if (content === 'hello\n') {
			log('✓ File content verified: ' + content.trim());
		} else {
			throw new Error(`File content mismatch. Expected: "hello\\n", Got: "${content}"`);
		}

		// Test 7: List the new directory
		log('Listing directory: /home/test');
		const testFiles = kernel.readdirSync('/home/test');
		log('✓ /home/test contents: ' + testFiles.join(', '));

		// All tests passed!
		self.postMessage({
			type: 'complete',
			success: true,
			results: testResults
		});

	} catch (error) {
		log('✗ Test failed: ' + error.message, error.stack);
		self.postMessage({
			type: 'complete',
			success: false,
			error: error.message,
			stack: error.stack,
			results: testResults
		});
	}
}

// Start tests when worker receives init message
self.onmessage = (e) => {
	if (e.data.type === 'start') {
		runKernelTests();
	}
};

// Signal that worker is ready
self.postMessage({ type: 'ready' });
