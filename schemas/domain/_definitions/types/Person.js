module.exports = {
	supertypes: ["OrganizationAndPerson"],
	properties: {
		additionalName: {}, //used for a middle name
		address: {},
		birthDate: {},
		deathDate: {},
		familyName: {},
		gender: {},
		givenName: {}, //use along side familyName. More specific than 'name'
		honorificPrefix: {},
		honorificSuffix: {},
		jobTitle: {},
		memberOf: {

		},
		nationality: {},
	},
	required: ["name"],
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
