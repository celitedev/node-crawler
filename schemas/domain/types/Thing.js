module.exports = {

	// overwrites: "Thing",

	//limit to the following Schema.org properties that the direct supertyped defines
	properties: {
		"name": {},
		"url": {},
		"description": {
			//isMulti : false -> default
		},
		"alternateName": {
			//NOTE: isMulti needs to be defined on property `alternateName` as well. 
			//defining on property -> signal to underlying datastore (which may be shared between types)
			//define here on type.property -> signal for schemas
			"isMulti": true,
			// "minItems": 1,
			// "maxItems": 2,
		},
		"image": {
			"isMulti": true
		},
		"sameAs": { //might be use to provide references from canonical to specific sources.
			"isMulti": true
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
