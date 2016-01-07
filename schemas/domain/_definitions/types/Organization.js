module.exports = {
	supertypes: ["OrganizationAndPerson"],
	properties: {
		address: false,
		aggregateRating: false,
		// brand: false // Org or Brand
		department: false,
		dissolutionDate: false,
		employee: false,
		founder: false,
		foundingDate: false,
		legalName: false,
		location: false,
		logo: false,
		member: false, //e.g.: org or persons
		memberOf: false, //the inverse of 'member'
		// numberOfEmployees: false, QuantitativeValue
		parentOrganization: false,
		// review: false, //stored separately
		subOrganization: false,
	},
	//properties added on JSON-LD schema.org generation
	out_properties: {
		email: {
			aliasOf: "address.email"
		},
		faxNumber: {
			aliasOf: "address.faxNumber"
		},
		telephone: {
			aliasOf: "address.telephone"
		},
	}
};
