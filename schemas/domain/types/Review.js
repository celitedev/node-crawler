module.exports = {
	supertypes: ["Thing"],
	properties: {
		about: {},
		itemReviewed: {},
		reviewBody: {},
		reviewRating: {},
	},
	required: ["itemReviewed", "reviewBody"],
	removeProperties: ["sameAs", "image", "alternateName", "description"]
};
