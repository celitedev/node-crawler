module.exports = {
	supertypes: ['Thing'], // must be proper subset of overwrite-type
	properties: {
		aggregateRating: {},
		address: {},
		branchCode: {},
		containedInPlace: {},
		containsPlace: {
			"isMulti": true
		},
	}
};
