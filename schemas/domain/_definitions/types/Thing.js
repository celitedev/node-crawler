module.exports = {

	isAbstract: true,

	//limit to the following Schema.org properties that the direct supertyped defines
	properties: {
		"name": false,
		"url": false,
		"description": false,
		"alternateName": false,
		"image": false,
		"sameAs": false //might be use to provide references from canonical to specific sources.
	},
};
