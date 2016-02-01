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

var esMappingConfig = require("../schemas/erd/elasticsearch");

var domainUtils = require("../schemas/domain/utils");
var tableCanonicalEntity = r.table(domainUtils.statics.CANONICALTABLE);

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
		populateES: 0,
		updateStateOfEntities: 0
	}
});

var start = new Date().getTime();

Promise.resolve()
	.then(function warmPopulate() {
		var roots = domainConfig.domain.roots;
		_.each(roots, entityUtils.calcPropertyOrderToPopulate);
		console.log("done warm");
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

				var fieldsToFetch = _.uniq(esMappingConfig.refExpandWithFields.concat(["id", "_type"]));

				var refs = _.uniq(_.reduce(data.entities, function(arr, entity) {

					var refs = entity.fetchResolvedRefs();
					entity._refsResolved = refs;

					return arr.concat(refs);
				}, []));

				if (!refs.length) {
					return {};
				}

				return Promise.resolve().then(function() {
					return tableCanonicalEntity.getAll.apply(tableCanonicalEntity, refs).pluck(fieldsToFetch);
				}).then(function(results) {

					//skip building aliases since that's not needed
					var options = {
						skipAlias: true
					};

					return _.reduce(results, function(agg, result) {

						var entity = new CanonicalEntity({
							id: result.id,
							type: result._type
						}, result, options);

						var simpleDTO = entity.toSimple();
						delete simpleDTO._type;
						agg[entity.id] = simpleDTO;

						return agg;
					}, {});
				});

			})
			.then(function populateES(refMap) {

				var start = new Date().getTime();

				var bulk = _.reduce(data.entities, function(arr, entity) {
					var dto = entity.toElasticsearchObject(_.pick(refMap, entity._refsResolved));
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

				if (bulk.length) {
					return Promise.resolve().then(function() {
							return client.bulk({
								body: bulk
							});
						})
						.then(function() {
							data.time.populateES += new Date().getTime() - start;
						});
				}
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
