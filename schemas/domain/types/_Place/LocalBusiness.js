// A particular physical business or branch of an organization. 
// Examples of LocalBusiness include a restaurant, 
// a particular branch of a restaurant chain, a branch of a bank, a medical practice, 
// a club, a bowling alley, etc.
module.exports = {
	ancestors: ["Thing", "Place", "PlaceWithOpeninghours", "Organization"],
	supertypes: ["PlaceWithOpeninghours", "Organization"],
	properties: {
		// branchCode: {}, //already on Place
		// currenciesAccepted: {}, //now now
		openingHours: {},
		paymentAccepted: {},
		priceRange: {},
	}
};
