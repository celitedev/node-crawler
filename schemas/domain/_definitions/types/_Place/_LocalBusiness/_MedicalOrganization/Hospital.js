module.exports = {
	supertypes: [ //reorder supertypes so we end up with PlaceWithOpeningHours as root.
		"MedicalOrganization",
		"EmergencyService",
		"CivicStructure"
	],
	properties: {
		// availableService
		// medicalSpecialty
	}
};
