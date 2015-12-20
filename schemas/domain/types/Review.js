module.exports = {
	supertypes: ["Thing"],
	properties: {
		about: {}, //from creativeWOrk
		author: {}, //from creativeWOrk
		itemReviewed: {},
		reviewBody: {},
		reviewRating: {},
	},
	required: ["itemReviewed", "reviewBody"],
	removeProperties: ["sameAs", "image", "alternateName", "description"]
};
