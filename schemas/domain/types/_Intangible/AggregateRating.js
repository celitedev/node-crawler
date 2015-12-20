module.exports = {
	supertypes: ["RatingAbstract"],
	isValueObject: true, //contained by some
	properties: {
		ratingTotal: {}, //custom: keep a tally 
		ratingCount: {},
		// reviewCount: {} // believe this is totally out of context here
	}
};
