import path from '../modules/path.js';
import fs from '../modules/fs.js';

const ModuleCJSLoader = (await import("../modules/internal/modules/cjs/loader.js")).default;

export const kModuleSource = ModuleCJSLoader.kModuleSource;
export const kModuleExport = ModuleCJSLoader.kModuleExport;
export const kModuleExportNames = ModuleCJSLoader.kModuleExportNames;
export const kModuleCircularVisited = ModuleCJSLoader.kModuleCircularVisited;
export const initializeCJS = ModuleCJSLoader.initializeCJS;
export const Module = ModuleCJSLoader.Module;
export const findLongestRegisteredExtension = ModuleCJSLoader.findLongestRegisteredExtension;
export const resolveForCJSWithHooks = ModuleCJSLoader.resolveForCJSWithHooks;
export const loadSourceForCJSWithHooks = ModuleCJSLoader.loadSourceForCJSWithHooks;
export const populateCJSExportsFromESM = ModuleCJSLoader.populateCJSExportsFromESM;
export const wrapSafe = ModuleCJSLoader.wrapSafe;
export const wrapModuleLoad = ModuleCJSLoader.wrapModuleLoad;
export const kIsMainSymbol = ModuleCJSLoader.kIsMainSymbol;	
export const kIsCachedByESMLoader = ModuleCJSLoader.kIsCachedByESMLoader;
export const kRequiredModuleSymbol = ModuleCJSLoader.kRequiredModuleSymbol;
export const kIsExecuting = ModuleCJSLoader.kIsExecuting;
export const builtinModules = Object.keys(globalThis.coreModules);