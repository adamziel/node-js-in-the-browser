const urlModule = require('../node_modules/url/url.js');

module.exports = {
	...urlModule,
	URL: urlModule.Url,
};
