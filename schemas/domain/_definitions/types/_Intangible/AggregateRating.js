module.exports = {
	supertypes: ["RatingAbstract"],
	isValueObject: true, //contained by some
	properties: {
		ratingTotal: {}, //custom: keep a tally 
		ratingCount: {},
		// reviewCount: {} // seems totally out of context here
	},
};
