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

var dataProto = {
  state: {
    total: 0,
    batch: 1000,
    nrOfResults: 0
  },
  time: {
    getSourceEntities: 0,
    updateExistingAndInsertNewRefNorms: 0,
    addSourceRefIdToExistingRefs: 0,
    composeRefs: 0,
    fetchExistingAndInsertNewRefNormsForReferences: 0,
    updateModifiedDataForSourceEntities: 0
  }
};


Promise.resolve()
  .then(function processNewSources() {


    //Func: Process SourceEntities that haven't been processed here yet. 

    //Note: don't include _refToSourceRefIdMap. 
    //This property is written-to by subprocess `addSourceRefIdToExistingRefs`. 
    //Excluding it here pre-empts any possibility for race conditions on write of
    //this property. 

    var data = _.cloneDeep(dataProto);
    var fetchQuery = function () {
      return tableSourceEntity.getAll(false, {
        index: 'modifiedMakeRefs'
      }).without("_refToSourceRefIdMap").limit(data.state.batch).run();
    };

    return processStack(data, fetchQuery);

  })
  .then(function processExistingSources() {

    //Func: Process SourceEntities that have been processed but have become dirty since.

    var data = _.cloneDeep(dataProto);

    var doProcessExisting = true;

    var fetchQuery = function () {
      //fetch existing but dirty
      return tableSourceEntity.getAll(true, {
        index: 'dirtyForMakeRefs'
      }).without("_refToSourceRefIdMap").limit(data.state.batch).run();
    };

    return processStack(data, fetchQuery, doProcessExisting);

  })
  .finally(function () {
    console.log("QUITTING");
    redisClient.quit(); //quit
    r.getPoolMaster().drain(); //quit
  });


function processStack(data, fetchQuery, doProcessExisting) {


  var start = new Date().getTime();

  return Promise.resolve()
    .then(function processSourcesRecursive() {
      return Promise.resolve()
        .then(toolUtils.getSourceEntities(data, fetchQuery))
        .then(function calcStats(sourceEntities) {
          data.state.nrOfResults = sourceEntities.length;
          data.state.total += data.state.nrOfResults;
          console.log(!doProcessExisting ? "processNewSources" : "processExistingSources", data.state.total);
          return sourceEntities;
        })
        .then(toolUtils.resetDataFromSourceEntities(data))
        .then(toolUtils.updateExistingAndInsertNewRefNorms(data))
        .then(toolUtils.addSourceRefIdToExistingRefs(data))
        .then(toolUtils.composeRefs(data))
        .then(toolUtils.fetchExistingAndInsertNewRefNormsForReferences(data))
        .then(toolUtils.updateModifiedDataForSourceEntities(data))
        .then(timerStats(data, start))
        .then(function () {
          //process all new sources by recursively fetching and processing all sourceEntities in batches
          if (data.state.nrOfResults === data.state.batch) {
            return processSourcesRecursive();
          }
        });
    });
}



function timerStats(data, start) {
  return function calcStats() {
    var stats = _.reduce(data.time, function (agg, v, k) {
      agg[k] = v / 1000;
      return agg;
    }, {});
    stats.TOTAL = (new Date().getTime() - start) / 1000;
    console.log("Stats", JSON.stringify(stats, undefined, 2));
  };
}
