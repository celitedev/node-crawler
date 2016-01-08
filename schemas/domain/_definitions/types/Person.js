module.exports = {
	supertypes: ["OrganizationAndPerson"],
	properties: {
		additionalName: false, //used for a middle name
		address: false,
		birthDate: false,
		deathDate: false,
		familyName: false,
		gender: false,
		givenName: false, //use along side familyName. More specific than 'name'
		honorificPrefix: false,
		honorificSuffix: false,
		jobTitle: false,
		memberOf: false,
		nationality: false,
		name: true,
		subtypes: false,
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
