module.exports = {
	isAbstract: true,
	isCustom: true,
	supertypes: ["Intangible"],
	properties: {
		// bestRating: false, //curious: this seems type-level attribute?
		ratingValue: false,
		// worstRating: {} //curious: this seems type-level attribute?
	},
	removeProperties: ["sameAs", "alternateName", "url", "description", "name"]
};
