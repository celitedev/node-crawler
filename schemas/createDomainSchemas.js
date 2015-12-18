//In the end we need to end up with 



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

var schemaOrgDef = require("./domain/schemaOrgDef");
var properties = require("./domain").properties;
var types = require("./domain").types;
var utils = require("./utils");

//extend (default) our property def with schema.org property definitions.
var noOrigProps = [],
	typesNotSupported = [];

///////////////////////
//process properties //
///////////////////////
_.each(properties, function(p, k) {
	var propOverwrite = schemaOrgDef.properties[k];
	if (!propOverwrite && !p.isNew) {
		noOrigProps.push(k);
		return;
	}

	//////////////////////////////////////////////////////
	//check sub.ranges is proper subset of sup.ranges// //
	//////////////////////////////////////////////////////
	if (p.ranges) {

		var unsupportedRanges = [];
		_.each(p.ranges, function(r) {
			if (propOverwrite.ranges.indexOf(r) === -1) {
				unsupportedRanges.push(r);
			}
		});
		if (unsupportedRanges.length) {
			throw new Error("CONFIG ERR: range is not a proper subset of prop.range of overwritten type (propName, unsupportedRanges, supported): " +
				k + ", (" + unsupportedRanges.join(",") + ")" + ", (" + propOverwrite.ranges.join(",") + ")");
		}
	}

	_.defaults(p, propOverwrite);

	//check all types defined in `property.ranges` are supported
	_.each(p.ranges, function(type) {
		if (schemaOrgDef.datatypes[type]) {
			return;
		}
		if (types[type]) {
			return;
		}
		typesNotSupported.push({
			property: k,
			type: type
		});
	});

});
if (noOrigProps.length) {
	throw new Error("Following properties defined in our own definition, weren't defined in schema.org definition: " + noOrigProps.join(","));
}
if (_.size(typesNotSupported)) {
	throw new Error("Following types are not defined, although properties referencing to them are: " + JSON.stringify(typesNotSupported, null, 2));
}

//////////////////
//process types //
//////////////////
_.each(types, function(t, k) {

	/////////////////////////////////////////////
	//check if specified overwrite-type exists //
	/////////////////////////////////////////////

	t.overwrites = t.overwrites || k; //set t.overwrites = <key> specified.
	var overwrites = schemaOrgDef.types[t.overwrites];
	if (!overwrites) {
		throw new Error("CONFIG ERR: overwrites type specified which doesn't exist (type, overwrite type): " + k + ", " + t.overwrites);
	}

	//inherit some defaults from schema.org
	_.defaults(t, {
		id: overwrites.id,
		overwrites: k,
		properties: {},
		ancestors: _.clone(overwrites.ancestors),
		supertypes: _.clone(overwrites.supertypes),
		removeProperties: [],
	});

	/////////////////////////////////////////////
	//do some checks + extension of properties //
	/////////////////////////////////////////////
	var undefinedProps = [],
		undefinedPropsOwn = [],
		propsWithUnsupportedIsMulti = [];


	_.each(t.properties, function(propObj, propK) {

		//set defaults
		//- isMulti = false
		propObj.isMulti = propObj.isMulti || false;

		//check if properties defined exist in our own properties definition 
		//Remember: we already linked up/extened our own definition with schema.org property definitions
		if (!properties[propK]) {
			undefinedPropsOwn.push(propK);
			return;
		}

		//check if all defined `properties` on types are indeed defined by 'overwrites' type.
		if (overwrites.specific_properties.indexOf(propK) === -1) {
			undefinedProps.push(propK);
			return;
		}

		//find property from schemaOrg
		var propSchemaOrg = properties[propK];
		if (propObj.isMulti && !propSchemaOrg.isMulti) {
			propsWithUnsupportedIsMulti.push(propK);
		}

		_.defaults(propObj, propSchemaOrg);

	});


	if (undefinedPropsOwn.length) {
		throw new Error("CONFIG ERR: some properties not defined on our own properties definition (type, undefinedProps): " + k +
			", (" + undefinedPropsOwn.join(",") + ")");
	}

	if (undefinedProps.length) {
		throw new Error("CONFIG ERR: some properties not defined on the 'overwrite' type (type, overwrite type, undefinedProps): " + k + ", " +
			t.overwrites + ", (" + undefinedProps.join(",") + ")");
	}

	if (propsWithUnsupportedIsMulti.length) {
		throw new Error("CONFIG ERR: some properties defined as isMulti on type, but not defined as isMulti on property they reference (type, wrongProps): " + k +
			", (" + propsWithUnsupportedIsMulti.join(",") + ")");
	}


	types[k].specific_properties = types[k].properties;
	delete types[k].properties;
});


//type directives to inherit
var typeDirectivesToInherit = [
	"isValueObject"
];

//add `properties` which consists of all `specific_properties` of current type + all suptypes
//TODO: minus `remove_ancestor_properties`
_.each(types, function(t, k) {
	// if (k === "Place") {
	// 	console.log("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
	// 	console.log(t.specific_properties);
	// 	console.log("AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
	// }
	t.properties = _.cloneDeep(t.specific_properties);
	addSupertypeStuff(t, t);
	t.properties = _.omit(t.properties, t.removeProperties);
});


//https://github.com/Kwhen/crawltest/issues/52
var transientPropWithoutWriteFromDirective = [];
_.each(types, function(t, k) {
	_.each(t.properties, function(p, propK) {
		if (p.transient && !p.writeFrom) {
			transientPropWithoutCopyOfDirective.push({
				type: k,
				prop: propK
			});
		}
	});
});
if (transientPropWithoutWriteFromDirective.length) {
	throw new Error("defined prop with transient=true for which no writeFrom directive was set: " + JSON.stringify(transientPropWithoutCopyOfDirective));
}

function addSupertypeStuff(walkType, appliedType) {
	_.each(walkType.supertypes, function(supertypeName) {
		var supertype = types[supertypeName];
		if (!supertype) {
			throw new Error("supertype not defined in Kwhen config (Supertype, refDirect, refTrans) " + supertypeName + ", " + appliedType.id);
		}
		_.defaults(appliedType, _.pick(supertype, typeDirectivesToInherit));
		appliedType.removeProperties = _.uniq(appliedType.removeProperties.concat(supertype.removeProperties));
		_.extend(appliedType.properties, supertype.specific_properties);
		addSupertypeStuff(supertype, appliedType);
	});
}


//ancestors should be ordered to reflect actual subtype < supertype ordering. 
//So start with most generic and end with most specific. 
//NOTE: since tpye may have multiple direct supertypes there is some ambiguity here
var order = utils.getTypesInDAGOrder(types);
_.each(types, function(t) {
	t.ancestors = _.sortBy(_.uniq(t.ancestors), function(sup) {
		return order.indexOf(sup);
	});
});

module.exports = {
	datatypes: schemaOrgDef.datatypes,
	properties: properties,
	types: types,
};
