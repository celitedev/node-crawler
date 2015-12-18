module.exports = {
	properties: {
		addressCountry: {},
		addressLocality: {},
		addressRegion: {},
		postOfficeBoxNumber: {},
		postalCode: {},
		streetAddress: {},
	},
	removeProperties: [
		"name", "url", "description", "alternateName", "sameAs"
	]
};
