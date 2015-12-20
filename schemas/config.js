module.exports = {
	domain: {
		roots: [
			"Place",
			"Event",
			"PlaceWithOpeninghours", //combines  "LocalBusiness" and "CivicStructure"
			"OrganizationAndPerson", //combines "Person" and "Organization"
			"CreativeWork",

			//Below are mostly user generated

			"MediaObject",
			"Comment",
			"Review",

			"Rating"
			//NOTE: aggregateRating is separated from Rating and is contained as valueObject in other entities
		]
	}
};
