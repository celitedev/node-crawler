module.exports = {
	supertypes: ["Thing"],
	properties: {
		itemReviewed: {},
		reviewBody: {},
		reviewRating: {},
	},
	removeProperties: ["sameAs", "image", "alternateName", "description"]
};
