const internalUrl = require('../../../lib/internal/url');

module.exports = {
	...internalUrl,
	URL: require('../url').URL,
	pathToFileURL: (filepath) => {
		console.log('pathToFileURL', filepath);
		return new URL(`file://${filepath}`);
	},
};
