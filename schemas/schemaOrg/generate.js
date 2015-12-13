///////////////////////////////////////
//TODO: 
//1. json schema on below schemas //
///////////////////////////////////////


//Goal here is to model LOGICAL entity schemas that follow schema.org as closely as possible. 
//More specifically, 
//- a entity schema always inherits from exactly 1 schema.org schema
//- used attributes with the same name as schema.org specified attributes will always
//carry the same semantics. 
//
//It is however possible: 
//- to restrict a particular schema to use only a subset of defined attributes in it's schema.org parent. This allows
//for more concice schemas. 
//- to extend a schema with certain attributes after having verified that on attributes possibly cover the meaning as intended. 
//  - these attributes will be clearly marked as such using a namespace `kwhen`
//
//Validation (json-schema) will be specified over the crated entitytypes. 
//Again, this validation should NEVER conflict with a, imaginable json-schema defined for schema.org entities. IOW: 
//our json-schema will be a superset of rules: it only tightens restrictions, instead of losening or changing them. 
//
//Validation also specifies cardinality for all attributes. 
//
//End goal of this is: 
//
//INPUT: 
//1. generated JSON schema.org definition
//2. added properties not supported by schema.org but supported by subtypes.
//3. manually written json-schema validation on all individual *properties* as defined in 1 ans 2. 
//   NOTE: this may *limit* the `ranges` of a particular property defined in 2. 
//3. manually written concice subtypes of schema.org types (from 1), which may include added properties from 2.
//4. json-schema over types defined in 3. Covering: 
//  - unambigous cardinality for all supported properties
//  - required properties
//
//OUTPUT:
//1. datamodel including schema and attribute level validation. Later on this will enable us to generate mappings for ES, etc. 
//2. generate JSON-ld (or other formats) to output for all data, with link to schema.org type. 
//Unsupported attibs on schema.org are defined by additional Kwhen vocab.  
//3. other *Views* such as crawled input from, say, eventful can be presented (and validated) as part of this as well.

var _ = require("lodash");

var schemaOrgDef = require("./all");

var properties = {
	bla: {}
};

var types = {
	Thing: {

		// overwrites: "Thing",

		//limit to the following Schema.org properties that the direct supertyped defines
		properties: {
			"name": {},
			"url": {},
			"description": {
				//isMulti : false -> default
			},
			"alternateName": {
				"isMulti": true,
				// "minItems": 1,
				// "maxItems": 2,
				ranges: ['Text'] //just for example. We test that if ranges is defined, is specifies a subtype of ranges supported on overwrite-type.
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
	},
	Place: {
		supertypes: ['Thing'] // if needed you can 
	}
};


//extend (default) our property def with schema.org property definitions.
var noOrigProps = [];
_.each(properties, function(p, k) {
	var propOverwrite = schemaOrgDef.properties[k];
	if (!propOverwrite && p.isNew) {
		noOrigProps.push(k);
	}
	_.defaults(p, pOverwrite);
});
if (noOrigProps.length) {
	throw new Error("Following properties weren't defined in schema.org definition: " + noOrigProps.join(","));
}


_.each(types, function(t, k) {

	/////////////////////////////////////////////
	//check if specified overwrite-type exists //
	/////////////////////////////////////////////

	t.overwrites = t.overwrites || k; //set t.overwrites = <key> specified.
	var overwrites = schemaOrgDef.types[t.overwrites];
	if (!overwrites) {
		throw new Error("CONFIG ERR: overwrites type specified which doesn't exist (type, overwrite type): " + k + ", " + t.overwrites);
	}

	//inherit some defaults
	_.defaults(t, {
		id: overwrites.id,
		properties: [],
		overwrites: k,
		//TODO: check self specified 'supertypes' is a proper subset of overwrites.supertypes
		supertypes: _.clone(overwrites.supertypes),
	});


	/////////////////////////////////////////////
	//do some checks + extension of properties //
	/////////////////////////////////////////////
	var undefinedProps = [];
	_.each(types[k].properties, function(propObj, propK) {

		//set defaults
		//- isMulti = false
		propObj.isMulti = propObj.isMulti || false;

		/////////////////////////////////////////////////////////////////////////
		// check if all properties are indeed defined by 'overwrites' type.  //
		/////////////////////////////////////////////////////////////////////////
		if (overwrites.specific_properties.indexOf(propK) === -1) {
			undefinedProps.push(propK);
			return;
		}

		///////////////////////////////////////////////
		//check propery ref exists in overwrite Type //
		///////////////////////////////////////////////
		var propOverwrite = schemaOrgDef.properties[propK];
		if (!propOverwrite) {
			//property should exist (since a schema.org definition references it). Yet it doesn't exist -> fail hard
			throw new Error("ERROR in all.js. Couldn't find property: " + propK);
		}

		//////////////////////////////////////////////////////
		//check sub.ranges is proper subset of sup.ranges// //
		//////////////////////////////////////////////////////
		if (propObj.ranges) {

			var unsupportedRanges = [];
			_.each(propObj.ranges, function(r) {
				if (propOverwrite.ranges.indexOf(r) === -1) {
					unsupportedRanges.push(r);
				}
			});
			if (unsupportedRanges.length) {
				throw new Error("CONFIG ERR: range is not a proper subset of prop.range of overwritten type ( overwrite type, propName, unsupportedRanges, supported): " +
					t.overwrites + ", " + propK + ", (" + unsupportedRanges.join(",") + ")" + ", (" + propOverwrite.ranges.join(",") + ")");
			}
		}

		_.defaults(propObj, propOverwrite);
	});

	if (undefinedProps.length) {
		throw new Error("CONFIG ERR: some properties not defined on the 'overwrite' type (type, overwrite type, undefinedProps): " + k + ", " +
			t.overwrites + ", (" + undefinedProps.join(",") + ")");
	}

	types[k].specific_properties = types[k].properties;
	delete types[k].properties;
});


//add `properties` which consists of all `specific_properties` of current type + all suptypes
//TODO: minus `remove_ancestor_properties`
_.each(types, function addSuperTypeProperties(t, k) {
	t.properties = _.cloneDeep(t.specific_properties);
	addSupertypeProps(t, k, t.properties);
});

function addSupertypeProps(walkType, passTypeName, passProps) {
	_.each(walkType.supertypes, function(supertypeName) {
		var supertype = types[supertypeName];
		if (!supertype) {
			throw new Error("supertype not defined in Kwhen config (Supertype, refDirect, refTrans) " + supertypeName + ", " + passTypeName);
		}
		_.extend(passProps, supertype.specific_properties);
		addSupertypeProps(supertype, passTypeName, passProps);
	});
}

///////////////////////////////////////////////////////////////////////////////
//TODO: check all types that are referenced by property exist in our schemas //
///////////////////////////////////////////////////////////////////////////////

module.exports = {
	properties: properties,
	types: types,
};
