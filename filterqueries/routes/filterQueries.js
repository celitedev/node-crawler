var _ = require("lodash");
var Promise = require("bluebird");
var colors = require("colors");
var t = require("tcomb");


var domainUtils = require("../../schemas/domain/utils");
var domainConfig = require("../../schemas/domain/_definitions/config");

//DomainConfig
var roots = domainConfig.domain.roots;

module.exports = function(command) {

	var app = command.app;
	var config = command.config;
	var generatedSchemas = command.generatedSchemas;
	var r = command.r;
	var esClient = command.esClient;

	var erdEntityTable = r.table(domainUtils.statics.ERDTABLE);

	//FilterQueryUtils
	var filterQueryUtils = require("../utils")(generatedSchemas, r);


	app.get('/', function(req, res) {
		res.send('Use POST silly');
	});


	app.post('/question', function(req, res, next) {

		var filterQuery;
		return Promise.resolve()
			.then(function() {

				if (!req.body.sort) {
					throw new Error("sort required");
				}

				req.body.sort = _.isArray(req.body.sort) ? req.body.sort : [req.body.sort];

				//create object
				filterQuery = FilterQuery(req.body);

				//asserts
				if (!~roots.indexOf(filterQuery.type)) {
					throw new Error("filterQuery.type should be a known root: " + roots.join(","));
				}

				//perform query
				return filterQuery.performQuery();

			})
			.then(function success(json) {

				json.meta.query = {
					status: 200,
					filterQuery: filterQuery
				};

				res.json(json);
			})
			.catch(function(err) {
				err.filterQuery = filterQuery;
				return next(err);
			});
	});


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
		sort: t.Array,

		meta: t.maybe(t.Object)

	}, 'FilterQuery');


	FilterQuery.prototype.getRoot = function() {
		return this.type;
	};

	FilterQuery.prototype.getESIndex = function() {
		return "kwhen-" + this.getRoot().toLowerCase();
	};

	FilterQuery.prototype.getSort = function() {

		var self = this;

		//possible TODO: 
		//- sort by nested: https://www.elastic.co/guide/en/elasticsearch/reference/current/search-request-sort.html#nested-sorting
		//- sort by script: https://www.elastic.co/guide/en/elasticsearch/reference/current/search-request-sort.html#_script_based_sorting
		//- track scores: https://www.elastic.co/guide/en/elasticsearch/reference/current/search-request-sort.html#_track_scores
		return {
			sort: _.map(this.sort, function(s) {

				var esSort = {};

				function sortOnDistance() {
					//filter on geo

					//example
					// "sort": {
					// 	"type": "distance",
					// 	"path": "location",
					// 	"geo": [-73.9764,
					// 		40.7434
					// 	],
					// 	"options": {
					// 	  unit: "km" //default = mi
					// 	}
					// },

					if (!s.geo) {
						throw new Error("'geo'-attrib not defined on sort with type=distance||distanceUnser");
					}
					s.options = s.options || {};

					esSort._geo_distance = {

						unit: s.options.unit || "mi", //default 
						order: s.asc === undefined ? "asc" : (s.asc ? "asc" : "desc"), //default to asc
						"distance_type": "plane" //quicker and accurate enough on small distances.
					};

					//e.g.: path = 'location' -> location.geo for event
					var path = s.path ? s.path + ".geo" : "geo";

					//e.g location.geo ->
					path = filterQueryUtils.getPathForCompoundKey("Event", path.split("."), true);

					esSort._geo_distance[path] = s.geo;
				}

				switch (s.type) {

					case "doc":
						//filter by doc order
						//This is the most efficient.
						esSort._doc = {
							order: s.asc === undefined ? "asc" : (s.asc ? "asc" : "desc")
						};
						break;

					case "score":
						//filter on score
						esSort._score = {
							order: s.asc === undefined ? "desc" : (s.asc ? "asc" : "desc") //default desc sort order
						};
						break;

					case "field":
						//filter on field
						if (!s.field) {
							throw new Error("sort of type='field' should have 'field' defined");
						}
						esSort[s.field] = {
							order: s.asc === undefined ? "asc" : (s.asc ? "asc" : "desc")
						};
						break;


					case "distance":

						//filter on distance
						sortOnDistance();
						break;

					case "distanceUser":

						//filter on distance to user
						if (!self.meta || !self.meta.user || !self.meta.user.geo) {
							throw new Error("meta.user.geo needs to be defined for sort with type='distanceUser'");
						}

						s.geo = self.meta.user.geo;

						sortOnDistance();
						break;

					default:
						throw new Error("sort needs `type`-value of (doc,score,field,distance, distanceUser) but was: " + s.type);
				}

				return esSort;
			})
		};

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


		var options = _.defaults({
			_root: this.getRoot(),
			_type: this.spatial.type
		}, this.spatial.options || {});

		if (options._type === "nearUser") {
			if (!this.meta || !this.meta.user || !this.meta.user.geo) {
				throw new Error("need meta.user.geo for spatial type: nearUser");
			}
			options.geo = this.meta.user.geo;
			options._type = "nearPoint";
		}

		switch (options._type) {
			case "nearPoint":
				return filterQueryUtils.performSpatialPointQuery(options, this.spatial.path);
			case "location":
				return filterQueryUtils.performSpatialLookupQuery(options, this.spatial.path);
			case "containedInPlace":
				return filterQueryUtils.performSpatialLookupQuery(options, this.spatial.path);
			default:
				throw new Error("spatial type not supported: " + options._type);
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

			var splitSymbols = _.difference(compoundKey.split(/\.|--/), ["expand"]); //remove 'expand'
			var path = filterQueryUtils.getPathForCompoundKey(root, splitSymbols);

			if (!path) {
				throw new Error("following filter key not allowed: " + compoundKey);
			}

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

		var root = self.getRoot();

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
				_.merge(searchQuery.body, self.getFilter(), self.getTemporal(), self.getSpatial(), self.getSort(), function(a, b) {
					if (_.isArray(a)) {
						return a.concat(b);
					}
				});

				console.log(JSON.stringify(searchQuery, null, 2));

				return esClient.search(searchQuery);
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
					.then(function expandEntities(entities) {

						var expand = {};

						return Promise.resolve()
							.then(function() {

								//meta.refs.expand -> expand refs, based on array of dot-notated paths
								if (self.meta && self.meta.refs) {

									var expandFields = self.meta.refs.expand || [];
									expandFields = _.isArray(expandFields) ? expandFields : [expandFields];

									return filterQueryUtils.recurseReferencesToExpand(entities, root, expandFields, expand, self.meta.refs);
								}
							})
							.then(function() {
								return [entities, expand];
							});
					})
					.spread(function(entities, expand) {

						entities = entities || {};

						var obj = {};

						if (self.wantUnique) {
							obj.hit = (entities.length ? entities[0] : null);
						} else {
							obj.hits = entities;
						}

						if (self.meta && self.meta.refs && self.meta.refs.expand) {
							obj.expand = expand;
						}

						_.extend(obj, {
							meta: {
								elasticsearch: _.extend(_.omit(esResult, "hits"), {
									hits: _.omit(esResult.hits, "hits"),
									raw: self.wantRawESResults() ?
										(self.wantUnique ?
											(hits.length ? hits[0] : null) :
											hits) : undefined
								})
							}

						});

						return obj;
					});
			});
	};

};
