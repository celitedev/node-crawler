module.exports = {
	supertypes: ["Thing"],
	properties: {
		about: {}, //from creativeWOrk
		author: {}, //from creativeWOrk
		itemReviewed: {
			required: true
		},
		reviewBody: {
			required: true
		},
		reviewRating: {},
	},
	removeProperties: ["sameAs", "image", "alternateName", "description"]
};
