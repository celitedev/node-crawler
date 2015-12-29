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
//validate (json-schema) will be specified over the crated entitytypes. 
//Again, this validate should NEVER conflict with a, imaginable json-schema defined for schema.org entities. IOW: 
//our json-schema will be a superset of rules: it only tightens restrictions, instead of losening or changing them. 
//
//validate also specifies cardinality for all attributes. 
//
//End goal of this is: 
//
//INPUT: 
//1. generated JSON schema.org definition
//2. added properties not supported by schema.org but supported by subtypes.
//3. manually written json-schema validate on all individual *properties* as defined in 1 ans 2. 
//   NOTE: this may *limit* the `ranges` of a particular property defined in 2. 
//3. manually written concice subtypes of schema.org types (from 1), which may include added properties from 2.
//4. json-schema over types defined in 3. Covering: 
//  - unambigous cardinality for all supported properties
//  - required properties
//
//OUTPUT:
//1. datamodel including schema and attribute level validate. Later on this will enable us to generate mappings for ES, etc. 
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

	(function enrichDatatypes() {
		_.each(schemaOrgDef.datatypes, function(t) {
			t.isDataType = true;
		});
	}());

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
				required: []
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


		_extendPropertiesNonAliased();
		_extendPropertiesAliased();

		function _extendPropertiesNonAliased() {
			//Extend properties
			//Requires `ancestors` set on type as done in `calcTypeHierarchy`

			var noOrigProps = [],
				customOverwritingProps = [],
				typesNotSupported = [],
				ambiguousStrategyUndefined = [],
				ambiguousStrategyWrong = [];

			_.each(properties, function(p, k) {

				if (p.aliasOf) { //don't process aliased properties yet
					return;
				}

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

				//set validate and transform to arrays
				if (p.validate) {
					p.validate = _.isArray(p.validate) ? p.validate : [p.validate];
				}

				if (p.transform) {
					p.transform = _.isArray(p.transform) ? p.transform : [p.transform];
				}

				//Extend property with schemaOrg defaults
				_.defaults(p, propOverwrite, {
					isMulti: false,
					required: false,
					validate: [],
					transform: []
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
							unsupportedRanges.push(typeName);
						}
					}
				});

				if (unsupportedRanges.length) {
					throw new Error("range is not a proper subset of prop.range of overwritten type (propName, unsupportedRanges, supported): " +
						k + ", (" + unsupportedRanges.join(",") + ")" + ", (" + propOverwrite.ranges.join(",") + ")");
				}

				checkAmbiguousRangeType();

				function checkAmbiguousRangeType() {
					if (p.ranges.length > 1) {
						p.isAmbiguous = true;

						if (!p.ambiguitySolvedBy) {
							ambiguousStrategyUndefined.push(p.id);
						} else {
							//how to solve ambiguity on data presented to validation layer?
							switch (p.ambiguitySolvedBy.type) {
								case "implicitType":
									//simplest strategy which doesn't care at all. 
									//This proxies responsibility to storage layer to come up with correct instance. 
									//This requires any of the storage layers mentioned below:
									checkAmbiguousRangeStorageStrategy(["sharedRoot", "thingIndex"]);
									break;
								case "explicitType":
									//simplest strategy which requires that _type be defined
									checkAmbiguousRangeStorageStrategy();
									break;
								case "urlVsSomething":
									//if 1 item is a URL and only 2 items, we can disciminate on that
									if (p.ranges.length === 2) {
										var itemsAsUrl = _.filter(p.ranges, function(t) {
											return t === "URL";
										});
										if (itemsAsUrl.length !== 1) { //exactly 1 item should match URL
											return ambiguousStrategyWrong.push(p.id);
										}
										p.ambiguitySolvedBy.storage = "sharedField"; //default
										checkAmbiguousRangeStorageStrategy();
									} else {
										//length !=2 not supported
										ambiguousStrategyWrong.push(p.id);
									}
									break;

								default:
									throw new Error("ambiguitySolvedBy.type not supported. (propertyname, type) " + p.id + "," + p.ambiguitySolvedBy.type);
							}
						}
					}
				}

				function checkAmbiguousRangeStorageStrategy() {
					//how to store ambiguous data? 
					var nonEntityFound = false;
					switch (p.ambiguitySolvedBy.storage) {
						case "sharedField":
							//sharedField requires all types to be datatypes and share a common datatype

							var dts = _.map(p.ranges, function(typeName) {
								return schemaOrgDef.datatypes[typeName];
							});

							//if not all types are datetypes -> break 
							if (dts.length !== _.compact(dts).length) {
								ambiguousStrategyWrong.push(p.id);
								break;
							}

							var intersection = _.reduce(dts, function(inter, dt) {
								var ancestorOrSelf = dt.ancestors.concat(dt.id);
								return !inter ? ancestorOrSelf : _.intersection(inter, ancestorOrSelf);
							}, undefined);

							//if intersection.length > 0 -> there's a shared datatype left
							if (intersection.length) {
								p.ambiguitySolvedBy.sharedParentDataType = intersection[intersection.length - 1];
								p.isAmbiguitySolved = true;
							} else {
								ambiguousStrategyWrong.push(p.id);
							}

							break;
						case "sharedRoot":
							//if same root, everything can be stored in same index and queried there
							//This requires for all types to be Type (instead of DataType) and of the same root

							var roots = _.uniq(_.reduce(p.ranges, function(arr, typeName) {
								var t = types[typeName];
								if (!t || !t.isEntity) {
									nonEntityFound = true;
									return arr;
								}
								arr.push(t.rootName);
								return arr;
							}, []));

							//not all root covered entities || not all share the same root entity -> wrong
							if (nonEntityFound || roots.length > 1) {
								ambiguousStrategyWrong.push(p.id);
							} else {
								p.isAmbiguitySolved = true;
							}
							break;
						case "thingIndex":
							//everything can be queried through the thingIndex. This overaches different roots/type-indices.
							//This requires for all types to be Type (instead of DataType)
							_.each(p.ranges, function(typeName) {
								var type = types[typeName];
								if (!type || !type.isEntity) {
									nonEntityFound = true;
									return;
								}
							});
							if (nonEntityFound) {
								ambiguousStrategyWrong.push(p.id);
							} else {
								//all our entities. These are all guarenteed to be covered by ThingIndex. 
								p.isAmbiguitySolved = true;
							}
							break;
						default:
							throw new Error("ambiguitySolvedBy.storage not supported. (propertyname, type) " + p.id + "," + p.ambiguitySolvedBy.storage);
					}
				}

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
		}

		function _extendPropertiesAliased() {
			//process aliased properties
			_.each(properties, function(p, k) {
				if (!p.aliasOf) { //properties without aliasOf have already been processed
					return;
				}

				var alias = properties[p.aliasOf];

				if (!alias) {
					throw new Error("property defines alias which doesn't exist: " + k);
				}

				//check no attributes defined on prop-definition (except isCustom)
				if (_.size(_.omit(p, ["aliasOf", "isCustom", "ranges"]))) {
					throw new Error("property containing `aliasOf` may only contain prop (aliasOf, isCustom, ranges): " + k);
				}

				//if !isCustom - > check ranges the same.
				if (!p.isCustom) {
					var propOverwrite = schemaOrgDef.properties[k];
					if (!propOverwrite) {
						throw new Error("Following aliasOf-property defined in our own definition, wasn't defined in schema.org definition: " + k);
					}
					_.defaults(p, _.pick(propOverwrite, ["id", "comment", "comment_plain", "label", "url"]));
					if (_.difference(p.ranges, alias.ranges).length) {
						throw new Error("aliasOf-property doesn't have exact same range as aliased property: " + k);
					}
				}

				//fill in needed blanks for isCustom-property
				_.defaults(p, {
					id: k,
					label: k
				});

				//inherit remainder from aliased property, e.g.: ambiguitySolvedBy
				_.defaults(p, _.omit(alias, ["comment", "comment_plain", "url"]));
			});
		}
	}());


	(function extendTypesWithProperties() {

		//Array defining attributes that type-property is extended with from property. 
		//This directly makes sure that these attributes are not overwritten by type-specific property.

		var propertyDirectivesToInherit = [
			"id",
			"ranges",
			"supertypes",
			"ancestors",
			"ambiguitySolvedBy",
			"isAmbiguous",
			"isAmbiguitySolved",
			"isMulti",
			"validate",
			"transform"
		];

		_.each(types, function(t, k) {

			var undefinedPropsOwn = [];
			_.each(t.properties, function(propTypeSpecific, propK) {
				if (!properties[propK]) {
					undefinedPropsOwn.push(propK);
					return;
				}

				var propGlobal = properties[propK];

				_.extend(propTypeSpecific, _.pick(propGlobal, propertyDirectivesToInherit)); //extend some

				// required is OR'ed 
				propTypeSpecific.required = !!(propGlobal.required || propTypeSpecific.required || ~t.required.indexOf(propK));

				// DO NOT ALLOW CONCAT. THIS COMPLCIATES DATAMODEL FOR NO GAIN. //validate is concatted
				// propTypeSpecific.validate = (propTypeSpecific.validate || []);
				// propTypeSpecific.validate = propGlobal.validate.concat(_.isArray(propTypeSpecific.validate) ? propTypeSpecific.validate : [propTypeSpecific.validate]);

			});
			if (undefinedPropsOwn.length) {
				throw new Error("some properties not defined on our own properties definition (type, undefinedProps): " + k +
					", (" + undefinedPropsOwn.join(",") + ")");
			}

			t.specific_properties = t.properties;
			t.properties = _.cloneDeep(t.specific_properties);
		});
	}());


	(function recalcDomainsAttributeOnProperties() {

		//Recalc `domains` attrib on property
		//This is useful for later lookups
		var order = utils.getTypesInDAGOrder(types);

		//reset `domains`-attrib
		_.each(properties, function(p) {
			p.domains = [];
		});

		_.each(order, function(tName) {
			var t = types[tName];
			_.each(properties, function(p, pName) {
				if (!t.properties[pName]) return;
				if (!_.intersection(p.domains, t.ancestors).length) { //type not covered yet by ancestor
					p.domains.push(tName);
				}
			});
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
				t.required = t.required.concat(supertype.required);
			});
			t.properties = _.omit(t.properties, t.removeProperties);
		});
	}());


	(function checkSoundnessFN() {
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

			(function checkAliasedPropertiesCovered() {
				//given `A.aliasOf = B` check that all types that define A also define B.
				//https://github.com/Kwhen/crawltest/issues/82
				_.each(properties, function(p) {
					if (p.aliasOf) {

						var uncoveredDomains = [];
						_.each(p.domains, function(tName) {
							var t = types[tName];
							if (!t.properties[p.aliasOf]) {
								uncoveredDomains.push(tName);
							}
						});

						if (uncoveredDomains.length) {
							throw new Error("the following types don't contain the required prop: '" + p.aliasOf +
								"' which '" + p.id + "' aliases to: " + uncoveredDomains.join(","));
						}
					}
				});
			}());
		}
	}());

	return {
		datatypes: schemaOrgDef.datatypes,
		properties: properties,
		types: types
	};
};
