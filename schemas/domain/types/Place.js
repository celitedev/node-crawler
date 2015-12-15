module.exports = {
	properties: {
		aggregateRating: {},
		address: {},
		branchCode: {},
		containedInPlace: {
			"isMulti": true // TBD: not sure want entire hierarchy displayed?
		},
		containsPlace: {
			"isMulti": true
		},
		//event: we'll have events be looked up in separate index
		faxNumber: {
			writeFrom: "address.faxNumber"
		},
		geo: {},
		logo: {},
		// openingHoursSpecification: {}; //TODO
		//photo: //TODO ? There's already an image
		review: {},
		telephone: {
			writeFrom: "address.telephone"
		}
	}
};
