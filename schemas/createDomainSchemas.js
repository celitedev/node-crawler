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
var roots = config.domain.roots;

module.exports = function(configObj) {
	configObj = configObj || {};
	var checkSoundness = configObj.checkSoundness;

	if (checkSoundness) {
		console.log(("CHECKING FOR SOUNDNESS").green);
	} else {
		console.log(("NOT CHECKING FOR SOUNDNESS").red);
	}


	(function extendTypes() {

		_.each(types, function(t, k) {

			t.overwrites = t.overwrites || k;
			var overwrites = schemaOrgDef.types[t.overwrites];

			if (!overwrites && !t.isCustom) {
				throw new Error("CONFIG ERR: schema.org type specified which doesn't exist (type, overwrite type): " + k + ", " + t.overwrites);
			}

			overwrites = overwrites || {}; //for isCustom

			//inherit some defaults. Some of those are from schema.org overwrite type
			_.defaults(t, {
				id: overwrites.id || k,
				overwrites: k,
				properties: {},
				supertypes: _.clone(overwrites.supertypes),
				removeProperties: [],
			});

			if (!t.supertypes) {
				throw new Error("Type (probably isCustom) should have attrib 'supertypes' defined: " + k);
			}
			if (!t.id) {
				throw new Error("Type (probably isCustom) should have attrib 'id' defined: " + k);
			}
		});
	}());


	(function calcTypeHierarchy() {

		//Recalc ancestors from supertypes. 
		//This requires having set `supertypes` for all types, which is done in `extendTypes`

		_.each(types, function(t, k) {

			//reverse + uniq + reverse solves order in case of multiple supertypes
			//remember: most right one is lowest root.
			t.ancestors = _.uniq(recalcAncestorsRec(t).reverse()).reverse();

			var ancestorsAndSelf = _.uniq(t.ancestors.concat(t.id));
			var rootsForType = _.intersection(ancestorsAndSelf, roots); //guarantees sort order first arr
			if (rootsForType.length) {
				t.isEntity = true;
				t.isRoot = rootsForType[rootsForType.length - 1] === t.id;
				t.rootName = rootsForType[rootsForType.length - 1];
			}
		});

		//Bottom up recursion. Top down isn't possible because of multiple supertypes
		function recalcAncestorsRec(t) {
			return _.reduce(t.supertypes, function(arr, superName) {
				return arr.concat(recalcAncestorsRec(types[superName]));
			}, []).concat(t.supertypes || []);
		}
	}());


	(function pruneProperties() {
		//prune properties to only those used by at least 1 type //
		properties = _.pick(properties, _.reduce(types, function(out, t) {
			if (t.disable) {
				return out;
			}
			return out.concat(_.keys(t.properties));
		}, []));
	}());


	(function extendProperties() {

		var noOrigProps = [],
			customOverwritingProps = [],
			typesNotSupported = [],
			ambiguousStrategyUndefined = [],
			ambiguousStrategyWrong = [];

		_.each(properties, function(p, k) {

			//check if property found in schemaOrg. 
			//isCustom=true properties should not exit on schema.org def
			var propOverwrite = schemaOrgDef.properties[k];
			if (!propOverwrite && !p.isCustom) {
				noOrigProps.push(k);
				return;
			}
			if (propOverwrite && p.isCustom) {
				customOverwritingProps.push(k);
				return;
			}

			//Extend property with schemaOrg defaults
			_.defaults(p, propOverwrite, {
				isMulti: false
			});

			//missing attribute checks
			if (!p.ranges) {
				throw new Error("ranges-attrib not supported on (probably isCustom) property: " + k);
			}
			if (!p.id) {
				throw new Error("id-attrib not supported on (probably isCustom) property: " + k);
			}

			//check all types defined in `property.ranges` exist
			//also check for isCustom=false that ranges is compatible with underlying schema.org property.
			var unsupportedRanges = [];
			_.each(p.ranges, function(typeName) {

				var type = types[typeName] || schemaOrgDef.datatypes[typeName];

				if (!type) {
					typesNotSupported.push({
						property: k,
						type: typeName
					});
					return;
				}

				//check compatibility with underlying schema.org property: 
				//ranges should consist of types or subtypes as defined on schema.org property
				if (!p.isCustom) {
					var ancestorsOrSelf = type.ancestors.concat([typeName]);
					if (!_.intersection(propOverwrite.ranges, ancestorsOrSelf).length) {
						if (p.id === "itemReviewed") {
							console.log(ancestorsOrSelf);
						}
						unsupportedRanges.push(typeName);
					}
				}
			});

			if (unsupportedRanges.length) {
				throw new Error("range is not a proper subset of prop.range of overwritten type (propName, unsupportedRanges, supported): " +
					k + ", (" + unsupportedRanges.join(",") + ")" + ", (" + propOverwrite.ranges.join(",") + ")");
			}

			//check range ambiguity
			if (p.ranges.length > 1) {
				p.isAmbiguous = true;

				if (!p.ambiguitySolvedBy) {
					ambiguousStrategyUndefined.push(p.id);
				} else {
					switch (p.ambiguitySolvedBy.type) {
						case "urlVsSomething": //if 1 item is a URL and only 2 items, we can disciminate on that
							if (p.ranges.length === 2) {
								var itemsAsUrl = _.filter(p.ranges, function(t) {
									return t === "URL";
								});
								if (itemsAsUrl.length !== 1) { //exactly 1 item should match URL
									ambiguousStrategyWrong.push(p.id);
								} else {
									p.isAmbiguitySolved = true;
								}
							} else {
								//length !=2 not supported
								ambiguousStrategyWrong.push(p.id);
							}
							break;
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
						case "indicateRoot":
							var datatypeFound = false;
							nonEntityFound = false;
							_.each(p.ranges, function(typeName) {
								var type = types[typeName];
								if (!type) {
									datatypeFound = true;
									return;
								}
								if (!type.isEntity) {
									nonEntityFound = true;
								}
							});
							if (datatypeFound || nonEntityFound) {
								ambiguousStrategyWrong.push(p.id);
							} else {
								//TODO: check all types that reference this property have an extra property 
								//`itemOfRootType` defined
							}
							break;
						default:
							throw new Error("ambiguitySolvedBy.type not supported. (propertyname, type) " + p.id + "," + p.ambiguitySolvedBy.type);
					}
				}
			} //DONE: //check range ambiguity

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
	}());


	(function extendTypesWithProperties() {

		//Array defining attributes that type-property is extended with from property. 
		//This directly makes sure that these attributes are not overwritten be set on type-property.
		var propertyDirectivesToInherit = ["id", "ranges", "supertypes", "ancestors", "ambiguitySolvedBy", "isAmbiguous", "isAmbiguitySolved", "isMulti"];

		_.each(types, function(t, k) {

			var undefinedPropsOwn = [];
			_.each(t.properties, function(propObj, propK) {
				if (!properties[propK]) {
					undefinedPropsOwn.push(propK);
					return;
				}
				_.extend(propObj, _.pick(properties[propK], propertyDirectivesToInherit));
			});
			if (undefinedPropsOwn.length) {
				throw new Error("some properties not defined on our own properties definition (type, undefinedProps): " + k +
					", (" + undefinedPropsOwn.join(",") + ")");
			}

			t.specific_properties = t.properties;
			t.properties = _.cloneDeep(t.specific_properties);
		});
	}());


	(function extendTypesByInheriting() {

		//Traverseing hierary tree to set inherited properties, etc. 
		//This required running `extendTypes` and `extendProperties` and `extendTypesWithProperties` first. 

		//type directives to inherit
		var typeDirectivesToInherit = ["isValueObject"];

		_.each(types, function(t, k) {
			_.each(_.clone(t.ancestors).reverse(), function(supertypeName) { //reverse: travel up chain instead of down
				var supertype = types[supertypeName];
				if (!supertype) {
					throw new Error("supertype not defined in Kwhen config (Supertype, refDirect, refTrans) " + supertypeName + ", " + appliedType.id);
				}
				_.defaults(t, _.pick(supertype, typeDirectivesToInherit));
				_.defaults(t.properties, supertype.specific_properties);
				t.removeProperties = t.removeProperties.concat(supertype.removeProperties);
			});
			t.properties = _.omit(t.properties, t.removeProperties);
		});
	}());

	(function checkSoundness() {
		if (checkSoundness) {

			//check isAbstract | isValueObject | isEntity no overlap + complete coverage
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

			//check no properties exist that reference an abstract type
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
	}());

	return {
		datatypes: schemaOrgDef.datatypes,
		properties: properties,
		types: types
	};
};
