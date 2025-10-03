export const runInThisContext = (code, filename) => {
    // Create a function that executes the code in the current context.
    // This is a simplified polyfill that doesn't provide true VM isolation.
    // It attempts to return the result of the code if it's an expression.
    try {
        // Try running with 'return' to get expression value.
        // The parenthesis are to correctly handle object literals.
        const func = new Function(`return (${code})`);
        return func();
    }
    catch (e) {
        // If it fails with a syntax error, it's probably not an expression.
        // Fallback to original implementation.
        if (e instanceof SyntaxError) {
            try {
                const func = new Function(code);
                return func();
            }
            catch (error) {
                if (filename && error instanceof Error) {
                    error.message = `${filename}: ${error.message}`;
                }
                throw error;
            }
        }
        // Re-throw other errors
        if (filename && e instanceof Error) {
            e.message = `${filename}: ${e.message}`;
        }
        throw e;
    }
};
export const vmPolyfill = {
    runInThisContext: runInThisContext,
};
