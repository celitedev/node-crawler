module.exports = {
	// isAbstract: true,
	supertypes: ["Thing"], //not CreativeWork
	properties: {
		bitrate: false,
		contentSize: false,
		contentUrl: false,
		duration: false,
		uploadDate: false,
		about: false,
		author: false, //from creativeWOrk
		genre: false, //from creativeWOrk
		keywords: false, //from creativeWOrk
		license: false, //from creativeWOrk
	},
	removeProperties: ["sameAs", "alternateName", "description", "fact", "tag"]
};
