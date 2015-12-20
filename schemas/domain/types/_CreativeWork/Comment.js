module.exports = {
	supertypes: ["Thing"], //not CreativeWork
	properties: {
		about: {},
		author: {},
		text: {}
		//NOT NOW
		//upvoteCount
		//downvoteCount
	},
	removeProperties: ["sameAs", "alternateName", "description"]
};
