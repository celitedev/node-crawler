module.exports = {
	properties: {
		address: {},
		addressCountry: {
			writeFrom: "address.addressCountry"
		},
		elevation: {},
		latitude: {},
		longitude: {},
		postalCode: {
			writeFrom: "address.postalCode"
		},
	}
};
