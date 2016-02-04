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

var domainConfig = require("../schemas/domain/_definitions/config");

var config = require("../config");
var r = require('rethinkdbdash')(config.rethinkdb);

var esMappingConfig = require("../schemas/erd/elasticsearch")(generatedSchemas);

var domainUtils = require("../schemas/domain/utils");
var tableCanonicalEntity = r.table(domainUtils.statics.CANONICALTABLE);

var entities = require("../schemas/domain/entities")(generatedSchemas, r);
var entityUtils = require("../schemas/domain/entities/utils");
var CanonicalEntity = entities.CanonicalEntity;

var client = new elasticsearch.Client(config.elasticsearch);



var express = require('express');
var app = express();
var bodyParser = require('body-parser');
var methodOverride = require('method-override');

app.use(bodyParser());
app.use(methodOverride());

app.get('/', function(req, res) {
	res.send('Use POST silly');
});

var roots = domainConfig.domain.roots;

var FilterObject = t.struct({

}, 'FilterObject');

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
	filter: t.maybe(FilterObject),

	//return items similar to the items defined in filterObject. 
	//If similarTo and filter are both defined, similarTo is executed first
	similarTo: t.maybe(FilterObject),

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

FilterQuery.prototype.getFilter = function() {
	if (!this.filter) {
		return {
			"match_all": {}
		};
	} else {
		throw new Error("filter not implemented yet");
	}
};

FilterQuery.prototype.wantRawESResults = function() {
	return this.meta && this.meta.elasticsearch && this.meta.elasticsearch.showRaw;
};

FilterQuery.prototype.performQuery = function() {
	var self = this;

	return Promise.resolve()
		.then(function() {
			return client.search({
				index: self.getESIndex(),
				type: 'type1',
				body: {
					query: self.getFilter()
				}
			});
		})
		.then(function(esResult) {

			var hits = esResult.hits.hits;

			return Promise.resolve()
				.then(function() {

					if (hits.length) {

						if (self.wantUnique) {
							hits = esResult.hits.hits = hits.slice(0, 1);
						}
						return r.table(tableCanonicalEntity).getAll.apply(tableCanonicalEntity, _.pluck(hits, "_id"))
							.then(function(rdbResults) {

								var options = {
									skipAlias: true
								};

								return _.map(rdbResults, function(result) {
									return new CanonicalEntity({
										id: result.id,
										type: result._type
									}, result, options).toSimple();
								});
							});
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
