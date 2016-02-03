var UUID = require("pure-uuid");

module.exports = {
	statics: {
		NYC: {
			id: new UUID(5, "ns:URL", "NEWYORKCITYBABY").format(), //TEMP STUFF
			sourceId: "NEWYORKCITYBABY"
		}
	},
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
