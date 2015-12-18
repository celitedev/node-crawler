module.exports = {
	properties: {
		address: {},
		aggregateRating: {},
		// brand: {} // Org or Brand
		department: {},
		dissolutionDate: {},
		email: {
			writeFrom: "address.email"
		},
		employee: {

		},
		faxNumber: {
			writeFrom: "address.faxNumber"
		},
		founder: {

		},
		foundingDate: {},
		legalName: {},
		location: {

		},
		logo: {},
		member: { //e.g.: org or persons

		},
		memberOf: { //the inverse of 'member'

		},
		// numberOfEmployees: {}, QuantitativeValue
		parentOrganization: {},
		review: {

		},
		subOrganization: {

		},
		telephone: {
			writeFrom: "address.telephone"
		},
	}
};
