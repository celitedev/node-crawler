var _ = require("lodash");
var argv = require('yargs').argv;
var redis = require("redis");
var Promise = require("bluebird");
var uuid = require("uuid");

var generatedSchemas = require("../schemas/domain/createDomainSchemas.js")({
	checkSoundness: true,
	config: require("../schemas/domain/_definitions/config"),
	properties: require("../schemas/domain/_definitions").properties,
	types: require("../schemas/domain/_definitions").types,
	schemaOrgDef: require("../schemas/domain/_definitions/schemaOrgDef")
});

var config = require("../config");
var redisClient = redis.createClient(config.redis);
var r = require('rethinkdbdash')(config.rethinkdb);

var toolUtils = require("./utils")(generatedSchemas, r, redisClient);
var domainUtils = require("../schemas/domain/utils");
var tableSourceEntity = r.table(domainUtils.statics.SOURCETABLE);

var entities = require("../schemas/domain/entities")(generatedSchemas, r);
var CanonicalEntity = entities.CanonicalEntity;

var data = _.cloneDeep({
	state: {
		total: 0,
		batch: 1000,
		nrOfResults: 0
	},
	time: {
		getSourceEntities: 0,
		updateOrCreateCanonicalEntities: 0,
		updateMatchStateForSourceEntities: 0
	}
});

var start = new Date().getTime();


var fetchQuery = function() {
	return tableSourceEntity.getAll(true, {
		index: 'modifiedMatch'
	}).limit(data.state.batch).run();
};

Promise.resolve()
	.then(function processSourcesRecursive() {
		return Promise.resolve()
			.then(toolUtils.getSourceEntities(data, fetchQuery))
			.then(function calcStats(sourceEntities) {
				data.state.nrOfResults = sourceEntities.length;
				data.state.total += data.state.nrOfResults;
				console.log("Process SourceEntities", data.state.total);
				return sourceEntities;
			})
			.then(function resetDataObject(sourceObjects) {
				data.sourceObjects = sourceObjects;
			})
			.then(function updateOrCreateCanonicalEntities() {

				var start = new Date().getTime();

				var promises = _.map(data.sourceObjects, function(sourceEntity) {
					return new Promise(function(resolve, reject) {

						var state = {
							id: sourceEntity.id, //TEMP: use the id of the sourceEntity 
							type: sourceEntity._type,
						};

						var entity = new CanonicalEntity(state);

						//create DTO from SourceEntity
						var dto = sourceEntity.toSimple();
						delete dto._type;

						//Let's check for _refs, etc. and swap in all resolved references
						//if _refToSourceRefIdMap not exists, createSourceReferences not run yet and there's nothing to swap
						if (sourceEntity._refToSourceRefIdMap) {
							_.each(sourceEntity._refs, function(v, k) {
								if (k.indexOf(".") !== -1) {
									throw new Error("Create Canonical: below code doesn't work yet for  lookup for path with '.' yet: " + k);
								}
								_.each(_.isArray(v) ? v : [v], function(ref) {
									if (ref.isOutdated) {
										return;
									}

									var sourceRefId = sourceEntity._refToSourceRefIdMap[ref._refNormId];
									var origValues = dto[k]; //should exist...

									if (sourceRefId && origValues) {
										var origVal;
										if (_.isArray(origValues)) {

											for (var i = 0; i < origValues.length; i++) {
												origVal = origValues[i];
												if (ref._sourceId === origVal._ref._sourceId) {
													origValues[i] = sourceRefId;
												}
											}

										} else {
											origVal = origValues;
											//NOTE: we assume _ref-object exists. We would have failed earlier if it doesn't
											if (ref._sourceId === origVal._ref._sourceId) {
												dto[k] = sourceRefId;
											}
										}
									}

								});
							});
						}

						entity.set(dto);
						entity.commit(function(err) {
							if (err) {
								return reject(err);
							}
							resolve(entity);
						});

					}).reflect();
				});

				return Promise.resolve()
					.then(function() {
						return Promise.all(promises)
							.each(function(inspection) { //insepection API because we used `reflect()` above
								if (inspection.isRejected()) {

									var err = inspection.reason();

									if (err.isValidationError) {

										console.error("Validation error: Todo log #121", err);

										return;
									}

									//it's not a validation error. So we throw it which will fail (and thus reschedule)  the batch.
									throw err;

								}
							});
					})
					.then(function() {
						data.time.updateOrCreateCanonicalEntities += new Date().getTime() - start;
					});

			})
			.then(function updateMatchStateForSourceEntities() {

				var start = new Date().getTime();

				var d = new Date();

				//Tech: note: only updates _state.modifiedMatch and doesn't touch any other part.
				var updatedSourceEntityDTO = _.map(data.sourceObjects, function(v) {
					return {
						id: v.id,
						_state: {
							modifiedMatch: d
						}
					};
				});

				return Promise.resolve()
					.then(function() {
						return tableSourceEntity.insert(updatedSourceEntityDTO, {
							conflict: "update"
						});
					})
					.then(function() {
						data.time.updateMatchStateForSourceEntities += new Date().getTime() - start;
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
		redisClient.quit(); //quit
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
