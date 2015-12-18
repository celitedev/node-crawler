///////////////////////////////////////////////////////////
//own type as super for LocalBusiness and CivicStructure //
///////////////////////////////////////////////////////////
module.exports = {
	isCustom: true,
	ancestors: ["Thing", "Place"],
	supertypes: ["Place"],
	properties: {
		openingHours: {}
	}
};
