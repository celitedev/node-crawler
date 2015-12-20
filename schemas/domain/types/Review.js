module.exports = {
	supertypes: ["Thing"],
	properties: {
		itemReviewed: {},
		reviewBody: {},
		reviewRating: {},
	},
	required: ["itemReviewed", "reviewBody"],
	removeProperties: ["sameAs", "image", "alternateName", "description"]
};
