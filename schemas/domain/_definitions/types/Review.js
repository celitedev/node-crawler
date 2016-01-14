module.exports = {
	supertypes: ["Thing"],
	properties: {
		about: false, //from creativeWOrk
		author: false, //from creativeWOrk
		itemReviewed: true,
		reviewBody: true,
		reviewRating: false,
	},
	removeProperties: ["sameAs", "image", "alternateName", "description", "fact", "tag"]
};
