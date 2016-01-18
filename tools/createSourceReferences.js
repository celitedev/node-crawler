var _ = require("lodash");
var argv = require('yargs').argv;
var redis = require("redis");
var Promise = require("bluebird");

var generatedSchemas = require("../schemas/domain/createDomainSchemas.js")({
	checkSoundness: true,
	config: require("../schemas/domain/_definitions/config"),
	properties: require("../schemas/domain/_definitions").properties,
	types: require("../schemas/domain/_definitions").types,
	schemaOrgDef: require("../schemas/domain/_definitions/schemaOrgDef")
});

var domainUtils = require("../schemas/domain/utils");

var config = require("../config");
var redisClient = redis.createClient(config.redis);
var r = require('rethinkdbdash')(config.rethinkdb);

var entities = require("../schemas/domain/entities")(generatedSchemas, r);
var CanonicalEntity = entities.CanonicalEntity;
var SourceEntity = entities.SourceEntity;

function getSourceEntityState(result) {
	return {
		sourceType: result._sourceType,
		sourceUrl: result._sourceUrl,
		sourceId: result._sourceId,
		batchId: result._state.batchId,
		type: result._type,
		detailPageAware: false, //for completeness
	};
}

Promise.resolve().then(function processNewSources() {

	console.log("processNewSources");

	var batch = 100;
	var nrOfResults;

	//Func: Get SourceEntities that haven't been processed by this process yet. 
	//Tech: Get SourceEntities that don't exist in index 'modifiedMakeRefs'
	//'modifiedMakeRefs' is created based on field _state.modifiedMakeRefs. See #142 for more.
	var tableSourceEntity = r.table(domainUtils.statics.SOURCETABLE);
	return tableSourceEntity.getAll(false, {
			index: 'modifiedMakeRefs'
		}).limit(batch).run()
		.then(function processBatchOfNewSourceEntities(results) {

			nrOfResults = results.length;

			console.log("processing", nrOfResults);

			if (!nrOfResults) {
				return;
			}

			//format the results into actual SourceEntity domain objects.
			var sourceObjects = _.map(results, function(result) {
				return new SourceEntity(getSourceEntityState(result), result);
			});

			//Pluck the sourceId from each sourceObject
			var lookupDocsOnSourceId = _.pluck(sourceObjects, "sourceId");
			var lookupDocsOnId = _.pluck(sourceObjects, "id");
			var sourceIdToRefMap = _.reduce(sourceObjects, function(agg, obj) {
				agg[obj.id] = obj._refs || {};
				return agg;
			}, {});

			var refNormIdsFound = {};

			//Fetch all refNorms that have a sourceId in the above list
			//This should be enough. I.e.: no need to lookup by sourceUrl as well.
			var tableRefNorms = r.table(domainUtils.statics.REFNORMS);

			return tableRefNorms.getAll.apply(tableRefNorms, lookupDocsOnSourceId.concat({
					index: '_sourceId'
				})).run()
				.then(function createOrUpdateRefNorms(refNorms) {

					var refsPerSourceId = _.groupBy(refNorms, "_sourceId");

					//loop each sourceObject and check if Refnorm exist. 
					//If it does not -> create
					//If it does -> update with sourceUrl which may potentially not be set
					//In both cases update with sourceRefId, which will not be set most of the time. I.e.: it *may*
					//be set with same sourceRefId iff process crashed just after update and before this *transaction* 
					//was completed. 
					//It may NEVER have a different sourceRefId set since this would be a logic error
					var refNormsToUpsert = _.map(sourceObjects, function(obj) {

						var refNormArr = refsPerSourceId[obj.sourceId];

						var newRefNorm = {
							_sourceId: obj.sourceId,
							_sourceUrl: obj.sourceUrl,
							_sourceRefId: obj.id
						};

						if (refNormArr) { //guaranteed at least 1 element. 

							var err;
							if (refNormArr.length > 1) {
								err = new Error("Severe: multiple RefNorms found for sourceId: " + obj.sourceId);
								err.halt = true;
								throw err;
							}

							var refNorm = refNormArr[0];

							if (refNorm._sourceRefId) {
								if (refNorm._sourceRefId === obj.id) {
									// console.log("warning: updating refnorm for which sourceRefId already set to same", obj.id);
								} else {
									err = new Error("Severe: updating refnorm for which sourceRefId already set to DIFFERENT sourceRefId (want to set to, actual set to) " +
										obj.id + ", " + refNorm._sourceRefId);
									err.halt = true;
									throw err;
								}
							}

							refNormIdsFound[refNorm.id] = obj.id;
							newRefNorm.id = refNorm.id;
						}

						return newRefNorm;

					});

					return tableRefNorms.insert(refNormsToUpsert, {
						conflict: "update"
					}).run();

				})
				.then(function updateExistingRefX() {

					//All refX-rows that reference any of the refNormIds are updated with the corresponding
					//sourceRefId.

					if (_.size(refNormIdsFound)) {
						var tableRefX = r.table(domainUtils.statics.REFX);
						return tableRefX.getAll.apply(tableRefX, _.keys(refNormIdsFound).concat({
							index: 'refNormId'
						})).update({
							sourceRefId: r.expr(refNormIdsFound).getField(r.row('refNormId')) //lookup sourceRefId in <refNormId -> sourceRefId> map
						});
					}
				})
				.then(function addNewRefX() {

					_.each(sourceObjects, function(obj) {
						var refs = obj.updateRefs();
						console.log(refs);
						sourceIdToRefMap[obj.id] = refs;
					});

				})
				.then(function updateModifiedDateForSourceEntities() {

					// Update 'modifiedMakeRefs' and '_refs' for all processed sourceEntities in this batch. 
					//
					// Note: we have to fetch by the exact sourceEntity-ids instead of doing, say, 
					// tableSourceEntity.getAll(false, {
					// 	index: 'modifiedMakeRefs'
					// }).limit(batch)
					//
					// Since the latter may have changed in the meantime.

					var d = new Date();

					return tableSourceEntity.getAll.apply(tableSourceEntity, lookupDocsOnId.concat({
						index: 'id'
					})).update({
						_state: {
							modifiedMakeRefs: d
						},
						// _refs: r.expr(sourceIdToRefMap).getField(r.row("id"))
					});
				});
		})
		.then(function() {
			//process all new sources by recursively fetching and processing all sourceEntities in batches
			if (nrOfResults === batch) {
				return processNewSources();
			}
		});


}).finally(function() {

	console.log("QUITTING");

	//quit
	redisClient.quit();
	r.getPoolMaster().drain();
});
