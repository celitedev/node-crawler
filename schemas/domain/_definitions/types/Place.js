module.exports = {
	properties: {
		aggregateRating: false,
		address: false,
		name: true,
		branchCode: false,
		containedInPlace: false, // TBD: not sure want entire hierarchy displayed?
		containsPlace: false,
		geo: false,
		logo: false,
		subtypes: false,
		// openingHoursSpecification: {}; //TODO
		//photo: //TODO ? There's already an image
		// review: false, //stored separately
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
