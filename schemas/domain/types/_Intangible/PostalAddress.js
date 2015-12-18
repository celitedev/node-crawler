module.exports = {
	properties: {
		addressCountry: {},
		// addressCity: {
		// 	isCustom: true
		// },
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
