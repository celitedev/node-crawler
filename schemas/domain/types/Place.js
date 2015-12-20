module.exports = {
	properties: {
		aggregateRating: {},
		address: {},
		branchCode: {},
		containedInPlace: {
			// TBD: not sure want entire hierarchy displayed?
		},
		containsPlace: {},
		//event: we'll have events be looked up in separate index
		geo: {},
		logo: {},
		// openingHoursSpecification: {}; //TODO
		//photo: //TODO ? There's already an image
		// review: {}, //stored separately
	},
	//properties added on JSON-LD schema.org generation
	out_properties: {
		faxNumber: {
			aliasOf: "address.faxNumber"
		},
		telephone: {
			aliasOf: "address.telephone"
		},
	}
};
