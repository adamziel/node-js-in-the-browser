import { Module } from './modules/module.js';

interface RunModuleOptions {
	code: string;
	path: string;
}
export function runModule(options: RunModuleOptions) {
	Module.runMain(options);
}

globalThis.Module = Module;

// Node Response class has an abort method.
globalThis.Response.prototype.abort = () => {
	// do nothing
};

