var _ = require("lodash");
var argv = require('yargs').argv;
var redis = require("redis");
var Promise = require("bluebird");
var uuid = require("uuid");
var elasticsearch = require('elasticsearch');

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
var tableERDEntity = r.table(domainUtils.statics.ERDTABLE);

var entities = require("../schemas/domain/entities")(generatedSchemas, r);
var entityUtils = require("../schemas/domain/entities/utils");
var CanonicalEntity = entities.CanonicalEntity;

var client = new elasticsearch.Client(config.elasticsearch);


var data = _.cloneDeep({
	state: {
		total: 0,
		batch: 1000,
		nrOfResults: 0
	},
	time: {
		getEntities: 0,
		fetchRefs: 0,
		populateRethinkERD: 0,
		populateES: 0,
		updateStateOfEntities: 0
	}
});

var start = new Date().getTime();

Promise.resolve()
	.then(function warmPopulate() {
		var roots = domainConfig.domain.roots;

		_.each(roots, entityUtils.calcPropertyOrderToPopulate);

		var allProps = _.extend({}, esMappingConfig.properties, esMappingConfig.propertiesCalculated);

		///
		///Enum-config is normalized. 
		///
		///- add lowercase to `transform` 
		_.each(allProps, function(prop, propName) {

			if (!prop.enum) return;

			// if mapping has an enum we should always do a lowercase transform
			// This is the same for the search-end
			prop.transform = prop.transform || [];
			prop.transform = _.isArray(prop.transform) ? prop.transform : [prop.transform];
			prop.transform.push("lowercase");

		});

	})
	.then(function processSourcesRecursive() {
		return Promise.resolve()
			.then(function getEntities() {
				var start = new Date().getTime();

				return Promise.resolve()
					.then(function fetchRows() {
						return tableCanonicalEntity.getAll(true, {
							index: "modifiedERD"
						}).limit(data.state.batch);
					})
					.then(function createCanonicalEntities(results) {

						//skip building aliases since that's not needed
						var options = {
							skipAlias: true
						};

						return _.map(results, function(result) {
							return new CanonicalEntity({
								id: result.id,
								type: result._type
							}, result, options);
						});
					})
					.then(function(results) {
						data.time.getEntities += new Date().getTime() - start;
						return results;
					});
			})
			.then(function calcStats(entities) {
				data.state.nrOfResults = entities.length;
				data.state.total += data.state.nrOfResults;
				console.log("Process CanonicalEntities", data.state.total);
				return entities;
			})
			.then(function resetDataObject(entities) {
				data.entities = entities;
			})
			.then(function fetchRefs() {

				var start = new Date().getTime();

				return Promise.resolve()
					.then(function() {
						return CanonicalEntity.fetchRefs(data.entities, true);
					})
					.then(function(refMap) {
						data.time.fetchRefs += new Date().getTime() - start;
						return refMap;
					});

			})
			.then(function createDTOS(refMap) {
				var start = new Date().getTime();

				return Promise.all(_.map(data.entities, function(entity) {
					return entity.toERDObject(refMap);
				})).then(function(dtos) {
					data.time.createDTOS += new Date().getTime() - start;
					return dtos;
				});
			})
			.then(function populateRethinkERD(dtos) {
				var start = new Date().getTime();
				return Promise.resolve()
					.then(function() {

						function recurseObjectToRemoveExpandKeys(dto) {

							//dtos to rethink are the ES dtos with --expand + --* removed
							return _.reduce(dto, function(agg, v, k) {

								if (!~k.indexOf("--")) { //only keep stuff for which key doesn't have '--'
									if (_.isArray(v)) {

										v = _.compact(_.map(v, function(singleItem) {
											var obj = _.isObject(singleItem) ? recurseObjectToRemoveExpandKeys(singleItem) : singleItem;
											return _.size(obj) ? obj : undefined;
										}));

										v = _.size(v) ? v : undefined;

									} else {
										v = _.isObject(v) ? recurseObjectToRemoveExpandKeys(v) : v;
									}
									if (v !== undefined) {
										agg[k] = v;
									}
								}

								return agg;
							}, {});
						}

						var dtosRethink = _.map(_.cloneDeep(dtos), recurseObjectToRemoveExpandKeys);

						return tableERDEntity.insert(dtosRethink, {
							conflict: "update"
						});
					})
					.then(function() {
						data.time.populateRethinkERD += new Date().getTime() - start;
					})
					.then(function passDTOsToES() {
						return dtos;
					});
			})
			.then(function populateES(dtos) {

				var start = new Date().getTime();

				var bulk = _.reduce(dtos, function(arr, dto) {
					var meta = {
						index: {
							_index: "kwhen-" + dto._root.toLowerCase(),
							_type: 'type1',
							_id: dto.id
						}
					};
					delete dto._root;
					return arr.concat([meta, dto]);
				}, []);

				return Promise.resolve()
					.then(function() {
						if (bulk.length) {
							return Promise.resolve().then(function() {
									return client.bulk({
										body: bulk
									});
								})
								.then(function(results) {
									if (results.errors) {
										var errors = _.filter(results.items, function(result) {
											return result.index.status >= 300;
										});
										console.log("ERRORS IN ES BULK INSERT************************");
										console.log(JSON.stringify(errors, null, 2));
									}
								});
						}
					})
					.then(function() {
						data.time.populateES += new Date().getTime() - start;
					});
			})
			.then(function updateStateOfEntities() {

				var start = new Date().getTime();
				var d = new Date();

				var updatedEntitiesDTO = _.map(data.entities, function(v) {
					return {
						id: v.id,
						_state: {
							modifiedERD: d
						}
					};
				});

				return Promise.resolve()
					.then(function() {
						return tableCanonicalEntity.insert(updatedEntitiesDTO, {
							conflict: "update"
						});
					})
					.then(function() {
						data.time.updateStateOfEntities += new Date().getTime() - start;
					});

			})
			.then(timerStats(data, start))
			.then(function() {
				//process all new sources by recursively fetching and processing all sourceEntities in batches
				if (data.state.nrOfResults === data.state.batch) {
					return processSourcesRecursive();
				}
			});
	})
	.catch(function(err) {
		throw err;
	})
	.finally(function() {
		console.log("QUITTING");
		r.getPoolMaster().drain(); //quit
	});


function timerStats(data, start) {
	return function calcStats() {
		var stats = _.reduce(data.time, function(agg, v, k) {
			agg[k] = v / 1000;
			return agg;
		}, {});
		stats.TOTAL = (new Date().getTime() - start) / 1000;
		console.log("Stats", JSON.stringify(stats, undefined, 2));
	};
}
