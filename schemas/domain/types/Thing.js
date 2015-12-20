module.exports = {

	isAbstract: true,

	//limit to the following Schema.org properties that the direct supertyped defines
	properties: {
		"name": {},
		"url": {},
		"description": {},
		"alternateName": {},
		// "image": {}, //nope: on ImageObject index instead
		"sameAs": { //might be use to provide references from canonical to specific sources.

		}
	},
};
