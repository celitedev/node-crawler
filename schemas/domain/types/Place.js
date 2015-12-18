module.exports = {
	properties: {
		aggregateRating: {},
		address: {},
		branchCode: {},
		containedInPlace: {
			// TBD: not sure want entire hierarchy displayed?
		},
		containsPlace: {

		},
		//event: we'll have events be looked up in separate index
		faxNumber: {
			writeFrom: "address.faxNumber"
		},
		geo: {},
		logo: {},
		// openingHoursSpecification: {}; //TODO
		//photo: //TODO ? There's already an image
		review: {

		},
		telephone: {
			writeFrom: "address.telephone"
		}
	}
};
