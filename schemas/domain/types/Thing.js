module.exports = {

	isAbstract: true,

	// overwrites: "Thing",

	//limit to the following Schema.org properties that the direct supertyped defines
	properties: {
		"name": {},
		"url": {},
		"description": {},
		"alternateName": {},
		"image": {

		},
		"sameAs": { //might be use to provide references from canonical to specific sources.

		},
	},
	// //explicitly remove support for properties defined by ancestor types. 
	// //I.e.: a comment doesn't support a Image or something.
	// remove_ancestor_properties: {
	// 	//property names to remove by ancestors. format: `<name>: {}`
	// },
	// //properties added by Kwhen
	// added_properties: {

	// }
};
