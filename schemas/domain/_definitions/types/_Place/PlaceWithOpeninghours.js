///////////////////////////////////////////////////////////
//own type as super for LocalBusiness and CivicStructure //
///////////////////////////////////////////////////////////
module.exports = {
	isCustom: true,
	supertypes: ["Place"],
	properties: {
		openingHours: false,
		openingHoursSpecification: false
	}
};
