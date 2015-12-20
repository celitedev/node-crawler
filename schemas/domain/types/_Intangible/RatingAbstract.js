module.exports = {
	isAbstract: true,
	isCustom: true,
	supertypes: ["Intangible"],
	properties: {
		about: {}, //added bc 'itemReviewed'  aliases to this. 
		itemReviewed: {},
		// bestRating: {}, //curious: this seems type-level attribute?
		ratingValue: {},
		// worstRating: {} //curious: this seems type-level attribute?
	},
	removeProperties: ["sameAs", "alternateName", "url", "description", "name"]
};
