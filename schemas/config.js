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

			//all ratings are stored as root. This includes AggregateRating as subtype. 
			//This completes coverage as per https://github.com/Kwhen/crawltest/issues/76
			"Rating"

			//TODO: might bring review and rating together in same root 
			//(by creating a new placeholder type as with PlaceWithOpeninghours)

		]
	}
};
