var _ = require("lodash");

module.exports = function(generatedSchemas) {

	var erdConfig = require("../schemas/erd/elasticsearch")(generatedSchemas);
	var domainConfig = require("../schemas/domain/_definitions/config");
	var rootUtils = require("../schemas/domain/utils/rootUtils")(generatedSchemas);


	//Get all possible properties per root (including the properties defined on subtypes of said root)
	//Format: 
	//
	//Place: {
	//	gender: "Text"
	//}
	//
	//Later on we want to extend this with: 
	//- type for ES calc fields
	//- ways to see if we can do range queries (either ordinal OR number)
	//- ...
	var roots = domainConfig.domain.roots;
	var rootPropertyMap = _.reduce(roots, function(agg, root) {

		var calcPropNamesForRoot = _.reduce(erdConfig.propertiesCalculated, function(agg2, calcProp, name) {
			var roots = _.isArray(calcProp.roots) ? calcProp.roots : [calcProp.roots];
			if (calcProp.roots === true || ~roots.indexOf(root)) {
				agg2[name] = _.pick(calcProp, "isMulti");
			}
			return agg2;
		}, {});

		var nestedMap = {};

		agg[root] = _.extend(_.reduce(rootUtils.getPropertyMapForType(root, roots), function(agg2, v, k) {
			var key = k.substring(k.indexOf(".") + 1);

			var prop = generatedSchemas.properties[key];
			agg2[key] = _.pick(prop, "isMulti");

			//add expand info to be used for calculating paths
			if (erdConfig.properties[key]) {
				agg2[key].expand = erdConfig.properties[key].expand;
			}

			//add nested properties in case we're talking a valueObject here
			//Moreover, add isEntity, rootName, isValueObject attributes
			var nestedType = generatedSchemas.types[prop.ranges[0]];
			if (nestedType) {
				if (nestedType.isValueObject) {
					agg2[key].isValueObject = true;
					nestedMap[key] = nestedType;
				} else if (nestedType.isEntity) {
					agg2[key].isEntity = true;
					agg2[key].rootName = nestedType.rootName;
				}
			}

			return agg2;
		}, {}), calcPropNamesForRoot);


		//We allow for autoresolving properties. 
		//This means that we use a filterQuery on a Place and property, say, ratingValue, 
		//it should know to resolve it through Place.aggregateRating.ratingValue. 
		//
		//
		//TecH: Add nested properties if they didn't exist on root itself yet. 
		//e.g.: only include ratingValue (coming from AggregateRating) if root doesn't have
		//ratingValue defined as property itself
		agg[root] = _.reduce(nestedMap, function(inAgg, type, propName) {

			_.each(type.properties, function(nestedProp, nestedPropName) {
				if (inAgg[nestedPropName]) return; //only include property if it's not already set
				inAgg[nestedPropName] = _.extend(_.pick(nestedProp, "isMulti"), {
					path: propName
				});
			});

			return inAgg;
		}, agg[root]);


		return agg;
	}, {});



	function wrapWithNestedQueryIfNeeed(query, k) {

		var nestedQ = {
			"nested": {
				"query": {}
			}
		};

		var EXPAND_NEEDLE = "--expand";

		//calculate if we've got an expanded query going on.
		var expandObjNeedle = k.indexOf(EXPAND_NEEDLE);
		if (expandObjNeedle === -1) {

			//no expanded query: just return an ordinary range query
			return query;
		}

		//We're talking majestic expanded objects here. 
		//In Elasticsearch these are respresented as so-called nested objects, 
		//which require a specific way of querying. 
		//See: https://www.elastic.co/guide/en/elasticsearch/guide/current/nested-query.html

		if (k.substring(0, expandObjNeedle).indexOf(".") !== -1) {
			//Found expanded object but path doesn't start with it. 
			//e.g.: test.workfeatured--expand
			throw new Error("expanded object should be at beginning of query: " + k);
		}

		//nested path = name of expanded object, e.g.: workFeatured--expand
		nestedQ.nested.path = k.substring(0, expandObjNeedle + EXPAND_NEEDLE.length);
		nestedQ.nested.query = query;

		return nestedQ;
	}


	//filter keys may specify proper paths as follows: 
	//
	//- location -> pointing to property location
	//- location.containedInPlace -> pointing to id of containedInPlace for location
	//- location.name -> pointing to location name
	//- location.containedInPlace.name -> pointing to name of containedInPlace for location
	//
	function getPathForCompoundKey(root, propNameArr, objSupported) {

		//TECH: at the moment we only resolve these properties if there's an expansion defined to get to them.
		//I.e.: only if we need 1 query do we allow the key to be defined. 
		//Later on we may extend this by doing a lookup of related entities first, and work our way from the leafs to the root. 

		var propName = propNameArr.shift();
		var prop = rootPropertyMap[root][propName];

		if (!prop) {
			//Don't think we want this, since NLP - > FilterContext should be smart enough to query for Events instead of CreativeWorks
			//when location is involved. Similar for Persons -> Event
			throw new Error("magic path lookup not implemented yet. I.e.: specifycing `location` on CreativeWork, would go through Event");
		}

		if (prop.isValueObject) {

			if (!propNameArr.length) {

				// For normal filters: eg: location.aggregateRating = {..} not supported yet. 

				//..exceptions should inject `objSupported`
				if (objSupported) { //e.g.: spatial lookup on `geo`
					return (prop.path ? prop.path + "." : "") + propName;
				}

				throw new Error("path ending in ValueObject isn't supported (yet): " + propName);
			}
			//e.g.: aggregatedValue.ratingValue
			//We return the path is it would have been returned for `ratingValue`
			return getPathForCompoundKey(root, propNameArr, objSupported);
		}

		var path = (prop.path ? prop.path + "." : "") + propName; //possibly a valueObject

		//we reached the tail
		if (!propNameArr.length) return path;

		if (!prop.isEntity) return undefined; //no ValueObject and no Entity -> dot-separation not supported.

		//expand not defined which should be the case by now
		if (!prop.expand) return undefined;

		return path + (prop.expand.flatten ? "--" : "--expand.") + getPathForCompoundKey(prop.rootName, propNameArr, objSupported);

		//NOTE: again, LATER ON we allow resolving other related entities in a multi-stage lookup
	}


	function performSpatialPointQuery(options, path) {

		if (!options.geo) throw new Error("need `options.geo` for spatial type: nearPoint");

		path = path ? path + ".geo" : "geo"; //add `geo` to path if defined                  	               

		path = getPathForCompoundKey(options._root, path.split("."), true);

		var query = {
			geo_distance: {
				distance: options.distance || "2km",

				//https://www.elastic.co/guide/en/elasticsearch/guide/current/geo-distance.html
				//Faster lookups. This is ok since we're searching really close so can treat earth as a plane
				"distance_type": "plane",
			}
		};

		query.geo_distance[path] = options.geo;

		return {
			query: {
				bool: {
					must: wrapWithNestedQueryIfNeeed(query, path)
				}
			}
		};
	}

	function performSpatialLookupQuery(options, path) {

		if (!options.id && !options.name) {
			throw new Error("need options.id or options.name for spatial type: location or containedInPlace");
		}

		path = path ? path + "." + options._type : options._type; //add `location` or `containedInPlace` to path
		path += options.name ? ".name" : ""; //add `name` to path if defined, otherwise leave as is.                          	               

		path = getPathForCompoundKey(options._root, path.split("."));

		var query = {
			match: {}
		};

		query.match[path] = {
			query: options.name || options.id,
			operator: "and"
		};

		return {
			query: {
				bool: {
					must: wrapWithNestedQueryIfNeeed(query, path)
				}
			}
		};
	}

	function performTextQuery(v, k) {

		var matchQuery = {
			match: {}
		};
		matchQuery.match[k] = {
			query: v,

			//this requires all terms to be found. This is default (since only 1 term) for exact matches
			//and we require this for free text (e.g.: name) as well for now. 
			//
			//More info
			//- https://www.elastic.co/guide/en/elasticsearch/guide/current/match-multi-word.html
			//- https://www.elastic.co/guide/en/elasticsearch/guide/current/bool-query.html#_controlling_precision
			operator: "and"
		};

		return wrapWithNestedQueryIfNeeed(matchQuery, k);
	}


	//verbatim copy of range filter structure. Allowed keys: gt, gte, lt, lte
	function performRangeQuery(v, k) {

		var rangeQuery = {
			range: {}
		};
		rangeQuery.range[k] = v;

		return wrapWithNestedQueryIfNeeed(rangeQuery, k);
	}

	function performTemporalQuery(v, k) {

		var rangeQuery = {
			range: {}
		};
		rangeQuery.range[k] = v;

		return wrapWithNestedQueryIfNeeed(rangeQuery, k);
	}

	return {
		performTemporalQuery: performTemporalQuery,
		performRangeQuery: performRangeQuery,
		performTextQuery: performTextQuery,
		performSpatialPointQuery: performSpatialPointQuery,
		performSpatialLookupQuery: performSpatialLookupQuery,
		getPathForCompoundKey: getPathForCompoundKey,
		wrapWithNestedQueryIfNeeed: wrapWithNestedQueryIfNeeed,
	};

};
