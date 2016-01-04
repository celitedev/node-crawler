module.exports = {
	domain: {
		roots: [
			"Place",
			"Event",
			"PlaceWithOpeninghours", //combines  "LocalBusiness" and "CivicStructure"
			"OrganizationAndPerson", //combines "Person" and "Organization"
			"CreativeWork",

			"MediaObject", //VideoObject and ImageObject together for now in index

			//Below are mostly user generated
			"Comment",
			"Review",
			"Rating"
			//NOTE: aggregateRating is separated from Rating and is contained as valueObject in other entities
		]
	},
};
