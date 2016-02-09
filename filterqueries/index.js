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

//Rethink
var r = require('rethinkdbdash')(config.rethinkdb);
var domainUtils = require("../schemas/domain/utils");
var erdEntityTable = r.table(domainUtils.statics.ERDTABLE);

//Elasticsearch 
var client = new elasticsearch.Client(config.elasticsearch);


//DomainConfig
var domainConfig = require("../schemas/domain/_definitions/config");
var roots = domainConfig.domain.roots;


//FilterQueryUtils
var filterQueryUtils = require("./utils")(generatedSchemas);


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



FilterQuery.prototype.getTemporal = function() {

	if (!this.temporal) {
		return {};
	}

	//TODO: all the checking on values, properties given root and all that.
	//NOTE startDate hardcoded
	return {
		query: {
			bool: {
				must: filterQueryUtils.performTemporalQuery(this.temporal, "startDate")
			}
		}
	};

};

FilterQuery.prototype.getSpatial = function() {

	if (!this.spatial) {
		return {};
	}

	if (!this.spatial.type) throw new Error("Spatial query needs `type` property");
	if (!this.spatial.options) throw new Error("Spatial query needs `options` property");
	if (!this.spatial.path) throw new Error("Spatial query needs `path` property");

	var options = this.spatial.options,
		type = this.spatial.type,
		path = filterQueryUtils.getPathForCompoundKey(this.getRoot(), this.spatial.path.split(".")),
		query;


	if (type === "nearUser") {
		if (!this.meta || !this.meta.user || !this.meta.user.geo) {
			throw new Error("need meta.user.geo for spatial type: nearUser");
		}
		options.geo = this.meta.user.geo;
		type = "nearPoint";
	}

	switch (type) {
		case "nearPoint":
			return filterQueryUtils.performSpatialPointQuery(options, path);
		case "location":
			return filterQueryUtils.performSpatialLookupQuery(options, path);
		case "containedInPlace":
			return filterQueryUtils.performSpatialLookupQuery(options, path);
		default:
			throw new Error("spatial type not supported: " + type);
	}
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

	_.each(this.filter, function(v, compoundKey) {

		var path = filterQueryUtils.getPathForCompoundKey(root, compoundKey.split("."));

		if (!path) {
			throw new Error("following filter key not allowed: " + compoundKey);
		}

		console.log(path);

		//TODO: #183 - if compoundkey is an entity or valueObject and `v` is an object, allow
		//deep filtering inside nested object (which is either type = nested (multival) || type=object (singleval))

		var typeOfQuery = _.isObject(v) ? "Range" : "Text";
		var propFilter;

		switch (typeOfQuery) {
			case "Text":
				propFilter = filterQueryUtils.performTextQuery(v, path);
				break;

			case "Range":
				propFilter = filterQueryUtils.performRangeQuery(v, path);
				break;
		}

		//add filter to AND
		mustObj.push(propFilter);
	});


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
