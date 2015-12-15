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
			isMulti: true
		},
		faxNumber: {
			writeFrom: "address.faxNumber"
		},
		founder: {
			isMulti: true
		},
		foundingDate: {},
		legalName: {},
		location: {
			isMulti: true
		},
		logo: {},
		member: { //e.g.: org or persons
			isMulti: true
		},
		memberOf: { //the inverse of 'member'
			isMulti: true
		},
		// numberOfEmployees: {}, QuantitativeValue
		parentOrganization: {},
		review: {
			isMulti: true
		},
		subOrganization: {
			isMulti: true
		},
		telephone: {
			writeFrom: "address.telephone"
		},
	}
};
