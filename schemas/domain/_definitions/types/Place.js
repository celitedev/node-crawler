module.exports = {
	properties: {
		aggregateRating: {},
		address: {},
		branchCode: {},
		containedInPlace: {
			// TBD: not sure want entire hierarchy displayed?
		},
		containsPlace: {},
		geo: {},
		logo: {},
		// openingHoursSpecification: {}; //TODO
		//photo: //TODO ? There's already an image
		// review: {}, //stored separately
	},
	required: ["address", "name"],
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
