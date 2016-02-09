var _ = require("lodash");
var Promise = require("bluebird");
var elasticsearch = require('elasticsearch');
var colors = require("colors");
var t = require("tcomb");

var generatedSchemas = require("../schemas/domain/createDomainSchemas.js")({
	checkSoundness: true,
	config: require("../schemas/domain/_definitions/config"),
	properties: require("../schemas/domain/_definitions").properties,
	types: require("../schemas/domain/_definitions").types,
	schemaOrgDef: require("../schemas/domain/_definitions/schemaOrgDef")
});


var config = require("../config");
var erdMappingConfig = require("../schemas/erd/elasticsearch")(generatedSchemas);
var domainConfig = require("../schemas/domain/_definitions/config");
var esConfig = require("../schemas/erd/elasticsearch")(generatedSchemas);

var domainUtils = require("../schemas/domain/utils");
var rootUtils = require("../schemas/domain/utils/rootUtils")(generatedSchemas);


var entityUtils = require("../schemas/domain/entities/utils");



//Rethink
var r = require('rethinkdbdash')(config.rethinkdb);
var erdEntityTable = r.table(domainUtils.statics.ERDTABLE);

var entities = require("../schemas/domain/entities")(generatedSchemas, r);
var CanonicalEntity = entities.CanonicalEntity;


//Elasticsearch 
var client = new elasticsearch.Client(config.elasticsearch);


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

	var calcPropNamesForRoot = _.reduce(esConfig.propertiesCalculated, function(agg2, calcProp, name) {
		var roots = _.isArray(calcProp.roots) ? calcProp.roots : [calcProp.roots];
		if (calcProp.roots === true || ~roots.indexOf(root)) {
			agg2[name] = _.pick(calcProp, "isMulti");
		}
		return agg2;
	}, {});

	agg[root] = _.extend(_.reduce(rootUtils.getPropertyMapForType(root, roots), function(agg2, v, k) {
		var key = k.substring(k.indexOf(".") + 1);
		agg2[key] = _.pick(generatedSchemas.properties[key], "isMulti");
		return agg2;
	}, {}), calcPropNamesForRoot);


	return agg;
}, {});


/////////////
//EXPRESS  //
/////////////

var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var methodOverride = require('method-override');

app.use(bodyParser());
app.use(methodOverride());

app.get('/', function(req, res) {
	res.send('Use POST silly');
});



var SortObject = t.struct({
	type: t.String,
	options: t.Object,
	asc: t.Boolean,
}, 'SortObject');


var FilterQuery = t.struct({

	//A known root. This should be calculated out-of-band 
	type: t.String,

	//do we want a unique result or a list of results?
	wantUnique: t.Boolean,

	//How should we filter the returned results
	filter: t.maybe(t.Object),

	spatial: t.maybe(t.Object),

	temporal: t.maybe(t.Object),

	//return items similar to the items defined in filterObject. 
	//If similarTo and filter are both defined, similarTo is executed first
	similarTo: t.maybe(t.Object),

	//sort is always required. Also for wantUnique = true: 
	//if multiple values returned we look at score to see if we're confident
	//enough to return the first item if multiple items we're to be returned
	sort: t.maybe(SortObject),

	meta: t.maybe(t.Object)

}, 'FilterQuery');


FilterQuery.prototype.getRoot = function() {
	return this.type;
};

FilterQuery.prototype.getESIndex = function() {
	return "kwhen-" + this.getRoot().toLowerCase();
};


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



FilterQuery.prototype.getTemporal = function() {

	if (!this.temporal) {
		return {};
	}

	//TODO: all the checking on values, properties given root and all that.
	//NOTE startDate hardcoded
	return {
		query: {
			bool: {
				must: performTemporalQuery(this.temporal, "startDate")
			}
		}
	};

};


var spatialHelpers = {
	findDefaultPath: function findDefaultPath(command) {
		var path;
		//Find default path given context.
		switch (command.type) {
			case "location":
				switch (command.root) {
					case "Event":
						path = "location";
						break;
					case "OrganizationAndPerson":
						path = "inverse--performer.location";
						break;
					case "CreativeWork":
						path = "inverse--workFeatured.location";
						break;
					default:
						throw new Error("spatial type `location` is not supported for root: " + command.root);
				}
				break;
			case "nearPoint":
				switch (command.root) {
					case "Event":
						path = "location";
						break;
					case "Place":
						path = "";
						break;
					case "PlaceWithOpeninghours":
						path = "";
						break;
					case "OrganizationAndPerson":
						path = "inverse--performer.location";
						break;
					case "CreativeWork":
						path = "inverse--workFeatured.location";
						break;
					default:
						throw new Error("spatial type `nearPoint` is not supported for root: " + command.root);
				}
				break;

				// case "nearLocation":
				// 	switch (command.root) {
				// 		case "Event":
				// 			path = "location";
				// 			break;
				// 		case "OrganizationAndPerson":
				// 			path = "inverse--performer.location";
				// 			break;
				// 		case "CreativeWork":
				// 			path = "inverse--workFeatured.location";
				// 			break;
				// 		default:
				// 			throw new Error("spatial type `nearLocation` is not supported for root: " + command.root);
				// 	}
				// 	break;
			case "containedInPlace":
				switch (command.root) {
					case "Event":
						path = "location--expand.containedInPlace";
						break;
					case "Place":
						path = "containedInPlace";
						break;
					case "PlaceWithOpeninghours":
						path = "containedInPlace";
						break;
					case "OrganizationAndPerson":
						path = "inverse--performer.location--expand.containedInPlace";
						break;
					case "CreativeWork":
						path = "inverse--workFeatured.location--expand.containedInPlace";
						break;
					default:
						throw new Error("spatial type `containedInPlace` is not supported for root: " + command.root);
				}
				break;
			default:
				throw new Error("spatial type not supported: " + command.type);
		}

		return path;
	}
};

FilterQuery.prototype.getSpatial = function() {

	if (!this.spatial) {
		return {};
	}

	if (!this.spatial.type) throw new Error("Spatial query needs `type` property");
	if (!this.spatial.options) throw new Error("Spatial query needs `options` property");

	var options = this.spatial.options;

	var command = {
		path: options._path,
		options: options,
		queryVal: undefined,
		type: this.spatial.type,
		root: this.getRoot()
	};


	//type = nearUser
	//{
	//   "type": "Event", 
	//   "wantUnique": false,
	//   "filter": {
	//     "subtypes": "ScreeningEvent",
	//     "workFeatured--expand.name": "Kung Fu Panda 3"
	//   }, 
	//   "spatial": {
	//     "type": "nearUser",
	//     "options": {
	//       "distance": "5km"
	//     }
	//   },
	//   "meta": {
	//     "elasticsearch": {
	//       "showRaw": true 
	//     },
	//     "user": {
	//       "geo": {
	//         "lat": 40.7866, 
	//       	"lon":-73.9776 
	//       }
	//     }
	//   }
	// }
	if (command.type === "nearUser") {
		if (!this.meta || !this.meta.user || !this.meta.user.geo) {
			throw new Error("need meta.user.geo for spatial type: nearUser");
		}
		command.options.geo = this.meta.user.geo;
		command.type = "nearPoint";
	}

	//////////////
	//Find default path //
	//////////////
	command.path = options._path || spatialHelpers.findDefaultPath(command);

	switch (command.type) {

		//type = location
		// 		{
		//   "type": "Event", 
		//   "wantUnique": false,
		//   "filter": {
		//     "subtypes": "ScreeningEvent",
		//     "workFeatured--expand.name": "Kung Fu Panda 3"
		//   }, 
		//   "spatial": {
		//     "type": "location",
		//     "options": {
		//       "name": "amc"
		//     }
		//   },
		//   "meta": {
		//     "elasticsearch": {
		//       "showRaw": true 
		//     }
		//   }
		// }
		case "location":
			if (!command.options.id && !command.options.name) {
				throw new Error("need id or name for spatial type: Location");
			}
			command.path = command.options.name ? command.path + "--expand.name" : command.path;

			command.query = {
				match: {}
			};

			command.query.match[command.path] = {
				query: command.options.name || command.options.id,
				operator: "and"
			};

			break;

			//type = containedInPlace
			//
			// {
			//   "type": "Event", 
			//   "wantUnique": false,
			//   "filter": {
			//     "subtypes": "ScreeningEvent",
			//     "workFeatured--expand.name": "Kung Fu Panda 3"
			//   }, 
			//   "spatial": {
			//     "type": "containedInPlace",
			//     "options": {
			//       "name": "new"
			//     }
			//   }
			// }
		case "containedInPlace":
			if (!command.options.id && !command.options.name) throw new Error("need id or name for spatial type: containedInPlace");
			command.path = command.options.name ? command.path + "--name" : command.path;

			command.query = {
				match: {}
			};

			command.query.match[command.path] = {
				query: command.options.name || command.options.id,
				operator: "and"
			};

			break;

			//type = nearPoint
			//{
			// 		"type": "Event",
			// 		"wantUnique": false,
			// 		"filter": {
			// 			"subtypes": "ScreeningEvent",
			// 			"workFeatured--expand.name": "Kung Fu Panda 3"
			// 		},
			// 		"spatial": {
			// 			"type": "nearPoint",
			// 			"options": {
			// 				"geo": {
			// 					"lat": 40.7866,
			// 					"lon": -73.9776
			// 				},
			// 				"distance": "5km"
			// 			}
			// 		},
			// 		"meta": {
			// 			"elasticsearch": {
			// 				"showRaw": true
			// 			}
			// 		}
			// }
		case "nearPoint":
			if (!command.options.geo) throw new Error("need geo for spatial type: nearPoint");

			//if path is "" , we're on a Place|PlacewithOpeninghours so can ask directly
			//Otherwise, it's on the expanded object
			command.path += command.path ? "--expand.geo" : "geo";

			command.query = {
				geo_distance: {
					distance: command.options.distance || "2km",

					//https://www.elastic.co/guide/en/elasticsearch/guide/current/geo-distance.html
					//Faster lookups. This is ok since we're searching really close so can treat earth as a plane
					"distance_type": "plane",
				}
			};

			command.query.geo_distance[command.path] = command.options.geo;
			break;

			// case "nearLocation":
			// 	throw new Error("NearLocation not implemented yet");

			// 	//we need to fetch the geo from the location first, before being able to use it in a nearby query. 
			// 	//This requires 2 passes right?
			// 	if (command.options.geo === undefined || command.opions.geo === undefined) {
			// 		throw new Error("need geo for type: nearLocation");
			// 	}
			// 	command.path += "--expand.geo";
			// 	command.queryVal = command.options.geo;
			// 	break;

		default:
			throw new Error("spatial type not implemented: " + command.type);
	}



	return {
		query: {
			bool: {
				must: wrapWithNestedQueryIfNeeed(command.query, command.path)
			}
		}
	};
};


FilterQuery.prototype.getFilter = function() {
	if (!this.filter) {
		return {

		};
	}
	var query = {
		query: {
			bool: {}
		}
	};

	//For now we only support AND
	//TODO: Should support arbitary nested AND / OR, 
	//which should already be encoded as a nested structure in supplied filter object
	var mustObj = query.query.bool.must = [];

	var root = this.getRoot();
	var propertiesNotAllowed = [];

	_.each(this.filter, function(v, k) {

		var prop = rootPropertyMap[root][k];

		//TODO: Disable property checking for now
		// if (!prop) {
		// 	return propertiesNotAllowed.push(k);
		// }


		//TODO: realy simple check of typeOfQuery.
		//We likely want to do: 
		//- check property type
		//- based on property type decide candidate queryTypes. 
		//- based on supplied query decide winner from candidates. 
		//- error if query isn't supported by property

		var typeOfQuery = _.isObject(v) ? "Range" : "Text";
		var propFilter;

		switch (typeOfQuery) {
			case "Text":
				propFilter = performTextQuery(v, k);
				break;

			case "Range":
				propFilter = performRangeQuery(v, k);
				break;
		}

		//add filter to AND
		mustObj.push(propFilter);
	});

	if (propertiesNotAllowed.length) {
		throw new Error("following filter properties not allowed for root: " + propertiesNotAllowed.join(","));
	}

	return query;
};

FilterQuery.prototype.wantRawESResults = function() {
	return this.meta && this.meta.elasticsearch && this.meta.elasticsearch.showRaw;
};

FilterQuery.prototype.performQuery = function() {
	var self = this;

	return Promise.resolve()
		.then(function() {

			var searchQuery = {
				index: self.getESIndex(),
				type: 'type1',
				body: {}
			};

			//getFilter exends body. Can set: 
			//- query
			//- filter
			_.merge(searchQuery.body, self.getFilter(), self.getTemporal(), self.getSpatial(), function(a, b) {
				if (_.isArray(a)) {
					return a.concat(b);
				}
			});

			console.log(JSON.stringify(searchQuery.body));

			return client.search(searchQuery);
		})
		.then(function(esResult) {

			var hits = esResult.hits.hits;

			return Promise.resolve()
				.then(function() {

					if (hits.length) {

						if (self.wantUnique) {
							hits = esResult.hits.hits = hits.slice(0, 1);
						}
						return r.table(erdEntityTable).getAll.apply(erdEntityTable, _.pluck(hits, "_id"));
					}
				})
				.then(function(entities) {

					entities = entities || {};

					var obj = {
						hits: self.wantUnique ? (entities.length ? entities[0] : null) : entities
					};

					_.extend(obj, {
						esMeta: _.extend(_.omit(esResult, "hits"), {
							hits: _.omit(esResult.hits, "hits"),
							raw: self.wantRawESResults() ?
								(self.wantUnique ?
									(hits.length ? hits[0] : null) :
									hits) : undefined
						})
					});

					return obj;
				});
		});
};

app.post('/', function(req, res, next) {

	var filterQuery;
	return Promise.resolve()
		.then(function() {

			//create object
			filterQuery = FilterQuery(req.body);

			//asserts
			if (!~roots.indexOf(filterQuery.type)) {
				throw new Error("filterQuery.type should be a known root: " + roots.join(","));
			}

			//perform query
			return filterQuery.performQuery();

		})
		.then(function success(resultObj) {

			var json;

			//UGLY AS FUCK
			if (filterQuery.wantUnique) {
				json = {
					query: {
						status: 200,
						filterQuery: filterQuery
					},
					nrOfHits: resultObj.esMeta.hits.total,
					hit: resultObj.hits, //DIFFERENCE HERE: hits vs hits
					meta: _.extend({
						elasticsearch: resultObj.esMeta
					})
				};
			} else {
				json = {
					query: {
						status: 200,
						filterQuery: filterQuery
					},
					nrOfHits: resultObj.esMeta.hits.total,
					hits: resultObj.hits,
					meta: _.extend({
						elasticsearch: resultObj.esMeta
					})
				};
			}

			res.json(json);
		})
		.catch(function(err) {
			err.filterQuery = filterQuery;
			return next(err);
		});
});



app.use(function jsonErrorHandler(err, req, res, next) {
	console.error(err.stack);

	var status = 500;
	res.status(status).json({
		meta: {
			status: 200,
			filterQuery: err.filterQuery
		},
		error: err.message
	});
});


app.server = app.listen(3000, function() {
	console.log(('Tester for Kwhen FilterQueries. Do a POST to localhost:3000 to get started').yellow);
});


function exitHandler(options, err) {

	if (options.cleanup) {
		app.server.close();
		r.getPoolMaster().drain(); //quit
	}
	if (err) console.log(err.stack);
	if (options.exit) {
		console.log("Quitting");
		process.exit();
	}
}

//do something when app is closing
process.on('exit', exitHandler.bind(null, {
	cleanup: true
}));

//catches ctrl+c event
process.on('SIGINT', exitHandler.bind(null, {
	exit: true
}));
