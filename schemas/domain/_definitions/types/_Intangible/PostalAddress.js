module.exports = {
	properties: {
		addressCountry: false,
		// addressCity:false,
		neighborhood: false, //isCustom
		crossStreets: false, //isCustom
		addressLocality: false,
		addressRegion: false,
		postOfficeBoxNumber: false,
		postalCode: false,
		streetAddress: true,
	},
	removeProperties: [
		"name", "url", "description", "alternateName", "sameAs"
	]
};
