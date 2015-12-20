module.exports = {
	supertypes: ["RatingAbstract"],
	isValueObject: true, //contained by some
	properties: {
		ratingCount: {},
		reviewCount: {}
	}
};
