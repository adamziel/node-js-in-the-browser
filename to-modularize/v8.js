const estimatedHeapStats = () => {
    var _a, _b, _c, _d, _e, _f, _g;
    // Use performance.memory if available, otherwise provide fallback estimates.
    const memory = performance === null || performance === void 0 ? void 0 : performance.memory;
    if (memory) {
        return {
            total_heap_size: (_a = memory.totalJSHeapSize) !== null && _a !== void 0 ? _a : 0,
            total_heap_size_executable: (_b = memory.jsHeapSizeLimit) !== null && _b !== void 0 ? _b : 0,
            total_physical_size: (_c = memory.totalJSHeapSize) !== null && _c !== void 0 ? _c : 0,
            total_available_size: Math.max(((_d = memory.jsHeapSizeLimit) !== null && _d !== void 0 ? _d : 0) - ((_e = memory.usedJSHeapSize) !== null && _e !== void 0 ? _e : 0), 0),
            used_heap_size: (_f = memory.usedJSHeapSize) !== null && _f !== void 0 ? _f : 0,
            heap_size_limit: (_g = memory.jsHeapSizeLimit) !== null && _g !== void 0 ? _g : 0,
            malloced_memory: 0,
            peak_malloced_memory: 0,
            does_zap_garbage: 0,
            number_of_native_contexts: 1,
            number_of_detached_contexts: 0,
        };
    }
    const limit = 128 * 1024 * 1024;
    return {
        total_heap_size: limit,
        total_heap_size_executable: limit,
        total_physical_size: limit,
        total_available_size: limit,
        used_heap_size: 0,
        heap_size_limit: limit,
        malloced_memory: 0,
        peak_malloced_memory: 0,
        does_zap_garbage: 0,
        number_of_native_contexts: 1,
        number_of_detached_contexts: 0,
    };
};
export const getHeapStatistics = () => {
    return estimatedHeapStats();
};
export const getHeapSpaceStatistics = () => [];
export default {
    getHeapStatistics,
    getHeapSpaceStatistics,
};
