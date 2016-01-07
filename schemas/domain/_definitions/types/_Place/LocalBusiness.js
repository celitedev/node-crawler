// A particular physical business or branch of an organization. 
// Examples of LocalBusiness include a restaurant, 
// a particular branch of a restaurant chain, a branch of a bank, a medical practice, 
// a club, a bowling alley, etc.
module.exports = {
	//NOTE: PlaceWithOpeninghours should be defined latest to make sure we select that as 'closest root'
	//always
	supertypes: ["Organization", "PlaceWithOpeninghours"],
	properties: {
		// branchCode: false, //already on Place
		// currenciesAccepted: false, //now now
		openingHours: false,
		paymentAccepted: false,
		priceRange: false,
	}
};
