module.exports = {
	// isAbstract: true,
	supertypes: ["Thing"], //not CreativeWork
	properties: {
		bitrate: {},
		contentSize: {},
		contentUrl: {},
		duration: {},
		uploadDate: {},
		about: {},
		author: {}, //from creativeWOrk
		genre: {}, //from creativeWOrk
		keywords: {}, //from creativeWOrk
		license: {}, //from creativeWOrk
	},
	removeProperties: ["sameAs", "alternateName", "description"]
};
