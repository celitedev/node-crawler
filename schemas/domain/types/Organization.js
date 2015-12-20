module.exports = {
	supertypes: ["OrganizationAndPerson"],
	properties: {
		address: {},
		aggregateRating: {},
		// brand: {} // Org or Brand
		department: {},
		dissolutionDate: {},
		employee: {},
		founder: {},
		foundingDate: {},
		legalName: {},
		location: {},
		logo: {},
		member: { //e.g.: org or persons

		},
		memberOf: { //the inverse of 'member'

		},
		// numberOfEmployees: {}, QuantitativeValue
		parentOrganization: {},
		review: {},
		subOrganization: {},
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
