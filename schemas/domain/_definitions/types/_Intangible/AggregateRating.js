module.exports = {
	supertypes: ["RatingAbstract"],
	isValueObject: true, //contained by some
	properties: {
		ratingTotal: false, //custom: keep a tally 
		ratingCount: false,
		// reviewCount: false // seems totally out of context here
	},
};
