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
var colors = require("colors");

var schemaOrgDef = require("./domain/schemaOrgDef");
var properties = require("./domain").properties;
var types = require("./domain").types;
var utils = require("./utils");
var config = require("./config");

module.exports = function(configObj) {
	configObj = configObj || {};
	var checkSoundness = configObj.checkSoundness;

	if (checkSoundness) {
		console.log(("CHECKING FOR SOUNDNESS").green);
	} else {
		console.log(("NOT CHECKING FOR SOUNDNESS").red);
	}

	//extend (default) our property def with schema.org property definitions.
	var noOrigProps = [],
		customOverwritingProps = [],
		typesNotSupported = [];

	///////////////////////
	//process properties //
	///////////////////////
	_.each(properties, function(p, k) {
		var propOverwrite = schemaOrgDef.properties[k];
		if (!propOverwrite && !p.isCustom) {
			noOrigProps.push(k);
			return;
		}

		if (propOverwrite && p.isCustom) {
			customOverwritingProps.push(k);
			return;
		}

		_.defaults(p, propOverwrite, {
			isMulti: false
		});

		if (!p.ranges) {
			throw new Error("ranges-attrib not supported on (probably isCustom) property: " + k);
		}
		if (!p.id) {
			throw new Error("id-attrib not supported on (probably isCustom) property: " + k);
		}

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
	if (customOverwritingProps.length) {
		throw new Error("Following properties defined as isCustom but yet schema.org definition found. This is not allowed: " + customOverwritingProps.join(","));
	}
	if (_.size(typesNotSupported)) {
		throw new Error("Following types are not defined, although properties referencing to them are: " + JSON.stringify(typesNotSupported, null, 2));
	}

	/////////////////////////////////////////////
	//process types + type-specific properties //
	/////////////////////////////////////////////
	_.each(types, function(t, k) {

		t.overwrites = t.overwrites || k; //set t.overwrites = <key> specified.
		var overwrites = schemaOrgDef.types[t.overwrites] || {}; //default to {} -> support for isCustom = true
		if (!overwrites && !t.isCustom) {
			throw new Error("CONFIG ERR: overwrites type specified which doesn't exist (type, overwrite type): " + k + ", " + t.overwrites);
		}

		//inherit some defaults from schema.org
		_.defaults(t, {
			id: overwrites.id || k,
			overwrites: k,
			properties: {},
			ancestors: _.clone(overwrites.ancestors),
			supertypes: _.clone(overwrites.supertypes),
			removeProperties: [],
		});

		if (!t.supertypes) {
			throw new Error("Type should have attrib 'supertypes' defined: " + k);
		}

		//////////////////////////////////////////////////////////////////////
		//extend type-specific property schema with generic property schema //
		//////////////////////////////////////////////////////////////////////
		var undefinedPropsOwn = [];
		_.each(t.properties, function(propObj, propK) {

			//TODO: schema on type.properties to define we can't have things like isMulti here (this should be defined directly on props)

			//check if properties defined exist in our own properties definition 
			//Remember: we already linked up/extened our own definition with schema.org property definitions
			if (!properties[propK]) {
				undefinedPropsOwn.push(propK);
				return;
			}

			//set defaults from property to type-specific property. 
			//This property was in turn already enriched by schemaOrg if !isCustom
			_.defaults(propObj, properties[propK]);
		});

		if (undefinedPropsOwn.length) {
			throw new Error("CONFIG ERR: some properties not defined on our own properties definition (type, undefinedProps): " + k +
				", (" + undefinedPropsOwn.join(",") + ")");
		}

		types[k].specific_properties = types[k].properties;
		delete types[k].properties;
	});



	/////////////////////////////////////////////////////////////////////////////
	//recalculate ancestors from supertypes                                    //
	//Needed since we possibly may have added types in between                 //
	//Directly make sure order of ancestors is correct: end with most specific //
	/////////////////////////////////////////////////////////////////////////////

	//Bottom up recursion. Top down isn't possible because of multiple supertypes
	function recalcAncestorsRec(t) {
		return _.reduce(t.supertypes, function(arr, superName) {
			return arr.concat(recalcAncestorsRec(types[superName]));
		}, []).concat(t.supertypes);
	}
	_.each(types, function(t) {
		//reverse + uniq + reverse solves order in case of multiple supertypes
		//remember: most right one is lowest root)
		t.ancestors = _.uniq(recalcAncestorsRec(t).reverse()).reverse();
	});

	//////////////////////////////////////////////////////////////////////////////////////////////
	//NOTE: this guarantees *some* valid sort ordering (from generic to specific)               //
	//If a types has multiple supertypes and both of those supertypes are defined to be roots,  //
	//the last one specified is the one under which the type is placed.                         //
	//////////////////////////////////////////////////////////////////////////////////////////////

	var roots = config.domain.roots;
	_.each(types, function(t) {
		var ancestorsAndSelf = _.uniq(t.ancestors.concat(t.id));
		var rootsForType = _.intersection(ancestorsAndSelf, roots); //guarantees sort order first arr
		if (rootsForType.length) {
			t.isEntity = true;
			t.isRoot = rootsForType[rootsForType.length - 1] === t.id;
			t.rootName = rootsForType[rootsForType.length - 1];
		}
	});


	///////////////////////////////////////////////////////////////////////////
	//Walk the typechain (using supertype) to add properties from supertypes //
	///////////////////////////////////////////////////////////////////////////

	//type directives to inherit
	var typeDirectivesToInherit = [
		"isValueObject"
	];

	//add `properties` which consists of all `specific_properties` of current type + all suptypes
	_.each(types, function(t, k) {
		t.properties = _.cloneDeep(t.specific_properties);
		_.each(_.clone(t.ancestors).reverse(), function(supertypeName) { //reverse: travel up chain instead of down
			var supertype = types[supertypeName];
			if (!supertype) {
				throw new Error("supertype not defined in Kwhen config (Supertype, refDirect, refTrans) " + supertypeName + ", " + appliedType.id);
			}
			_.defaults(t, _.pick(supertype, typeDirectivesToInherit));
			_.extend(t.properties, supertype.specific_properties);
			t.removeProperties = t.removeProperties.concat(supertype.removeProperties);
		});
		t.properties = _.omit(t.properties, t.removeProperties);
	});



	////////////////////////////////////////////////////////////////////////////////////////////////
	// checkSoundness: isAbstract | isValueObject | isEntity no overlap + complete coverage //
	////////////////////////////////////////////////////////////////////////////////////////////////
	if (checkSoundness) {
		(function checkcoverage() {

			var typesNeither = [],
				typesMultiple = [];

			_.each(types, function(t) {
				if (!(t.isEntity || t.isValueObject || t.isAbstract)) {
					typesNeither.push(t.id);
				} else if ((t.isEntity && t.isValueObject) || (t.isEntity && t.isAbstract) || (t.isAbstract && t.isValueObject)) {
					typesMultiple.push(t.id);
				}
			});

			if (typesMultiple.length) {
				console.log((JSON.stringify(typesMultiple, null, 2)).red);
				throw new Error("above types define more than 1 of isEntity || isValueObject || isAbstract");
			}
			if (typesNeither.length) {
				console.log((JSON.stringify(typesNeither, null, 2)).red);
				throw new Error("above types don't define isEntity || isValueObject || isAbstract");
			}
		}());

		(function checkNoAbstractReference() {
			var abstractRefs = [];
			_.each(properties, function(p) {
				_.each(p.ranges, function(refTypeName) {
					var refType = types[refTypeName];
					if (!refType) return; //dataType
					if (refType.isAbstract) {
						abstractRefs.push({
							propName: p.id,
							abstractType: refTypeName
						});
					}
				});
			});
			if (abstractRefs.length) {
				console.log((JSON.stringify(abstractRefs, null, 2)).red);
				throw new Error("above properties reference abstract types. This should be solved");
			}
		}());
	}


	//////////////////////////////////////////////////////////
	//Transient property should defined writefrom-directive //
	//https://github.com/Kwhen/crawltest/issues/52          //
	//////////////////////////////////////////////////////////

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


	var ambiguousStrategyUndefined = [],
		ambiguousStrategyWrong = [];

	//extra checks on properties now that ancestors tree on on types has been correctly rebuild
	_.each(properties, function(p, k) {
		var propOverwrite = schemaOrgDef.properties[k];

		//check sub.ranges is proper subset of propOverwrite.ranges
		//It's ok if overwritten type is a subtype of a defined type as well
		if (!p.isCustom) {
			if (p.ranges) {
				var unsupportedRanges = [];
				_.each(p.ranges, function(r) {

					var type = types[r] || schemaOrgDef.datatypes[r];
					var ancestorsOrSelf = type.ancestors.concat([r]);
					if (!_.intersection(propOverwrite.ranges, ancestorsOrSelf).length) {
						unsupportedRanges.push(r);
					}
				});
				if (unsupportedRanges.length) {
					throw new Error("CONFIG ERR: range is not a proper subset of prop.range of overwritten type (propName, unsupportedRanges, supported): " +
						k + ", (" + unsupportedRanges.join(",") + ")" + ", (" + propOverwrite.ranges.join(",") + ")");
				}
			}
		}

		////////////////////////////////////////////////////////////
		//check ambiguity ranges supply a strategy for solving it
		//and this strategy is indeed applicable to supplied range //
		////////////////////////////////////////////////////////////
		if (p.ranges.length > 1) {
			p.isAmbiguous = true;

			if (!p.ambiguitySolvedBy) {
				ambiguousStrategyUndefined.push(p.id);
			} else {
				switch (p.ambiguitySolvedBy.type) {
					case "sharedRoot": //all mentioned types in range should have same root

						var nonEntityFound = false,
							nonRootCoveredEntityFound = false;

						var roots = _.uniq(_.reduce(p.ranges, function(arr, typeName) {
							var t = types[typeName];
							if (!t) {
								nonEntityFound = true;
								return arr;
							}
							if (!t.rootName) {
								nonRootCoveredEntityFound = true;
								return arr;
							}
							arr.push(t.rootName);
							return arr;
						}, []));

						//not all root covered entities || not all share the same root entity -> wrong
						if (nonEntityFound || nonRootCoveredEntityFound || roots.length > 1) {
							ambiguousStrategyWrong.push(p.id);
						} else {
							p.isAmbiguitySolved = true;
						}

						break;
					default:
						throw new Error("ambiguitySolvedBy.type not supported. (propertyname, type) " + p.id + "," + p.ambiguitySolvedBy.type);
				}
			}
		}
	});

	if (checkSoundness) {
		if (ambiguousStrategyWrong.length) {
			console.log((JSON.stringify(ambiguousStrategyWrong, null, 2).red));
			throw new Error("Above property define ambiguous ranges for which wrong `ambiguitySolvedBy`-strategy defined. This should be solved");
		}
		if (ambiguousStrategyUndefined.length) {
			console.log((JSON.stringify(ambiguousStrategyUndefined, null, 2).red));
			throw new Error("Above property define ambiguous ranges for which no `ambiguitySolvedBy` is defined. This should be solved");
		}
	}

	return {
		datatypes: schemaOrgDef.datatypes,
		properties: properties,
		types: types
	};
};
