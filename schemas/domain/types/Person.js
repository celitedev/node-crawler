module.exports = {
	supertypes: ["OrganizationAndPerson"],
	properties: {
		additionalName: {}, //used for a middle name
		address: {},
		birthDate: {},
		deathDate: {},
		email: {
			writeFrom: "address.email"
		},
		familyName: {},
		faxNumber: {
			writeFrom: "address.faxNumber"
		},
		gender: {},
		givenName: {}, //use along side familyName. More specific than 'name'
		honorificPrefix: {},
		honorificSuffix: {},
		jobTitle: {},
		memberOf: {

		},
		nationality: {},
		telephone: {
			writeFrom: "address.telephone"
		},
	}
};
