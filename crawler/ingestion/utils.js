var _ = require("lodash");
var redis = require("redis");
var Promise = require("bluebird");
var uuid = require("uuid");
var elasticsearch = require('elasticsearch');
var colors = require("colors");

var config = require("../../config");

var domainUtils = require("../../schemas/domain/utils");

var createEntities = function(generatedSchemas, argv){

  return new Promise(function (resolve, reject) {
    var redisClient = redis.createClient(config.redis);
    var r = require('rethinkdbdash')(config.rethinkdb);
    var toolUtils = require("../../tools/utils")(generatedSchemas, r, redisClient);
    var tableSourceEntity = r.table(domainUtils.statics.SOURCETABLE);
    var entities = require("../../schemas/domain/entities")(generatedSchemas, r);
    var CanonicalEntity = entities.CanonicalEntity;

    var err;

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


    var doProcessAll = argv.processAll;

    var fetchQuery = function () {
      if (doProcessAll) {
        return tableSourceEntity.limit(data.state.batch).run();
      } else {
        return tableSourceEntity.getAll(true, {
          index: 'modifiedMatch'
        }).limit(data.state.batch).run();
      }
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

            var promises = _.map(data.sourceObjects, function (sourceEntity) {
              return new Promise(function (resolve, reject) {

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
                  _.each(sourceEntity._refs, function (v, k) {
                    if (k.indexOf(".") !== -1) {
                      throw new Error("Create Canonical: below code doesn't work yet for  lookup for path with '.' yet: " + k);
                    }

                    //key is, say, location
                    _.each(_.isArray(v) ? v : [v], function (ref) {
                      if (ref.isOutdated) {
                        return;
                      }

                      //ref is, say
                      //{
                      // "_refNormId":  "1893a57a-0208-470b-9fff-c0e75b39a036" ,
                      // "_sourceId": http://concerts.eventful.com/Snoop-Dogg, »
                      // "_sourceUrl": http://concerts.eventful.com/Snoop-Dogg, »
                      // }

                      var sourceRefId = sourceEntity._refToSourceRefIdMap[ref._refNormId];
                      var origValues = dto[k]; //should exist...

                      //overwrite reference with found value
                      if (sourceRefId && origValues) {
                        var origVal;
                        if (_.isArray(origValues)) {

                          for (var i = 0; i < origValues.length; i++) {
                            origVal = origValues[i];
                            if (origVal._ref && ref._sourceId === origVal._ref._sourceId) {
                              origValues[i] = sourceRefId;
                            }
                          }

                        } else {
                          origVal = origValues;
                          if (origVal._ref && ref._sourceId === origVal._ref._sourceId) {
                            dto[k] = sourceRefId;
                          }
                        }
                      }

                    });
                  });
                }

                entity.set(dto);
                entity.commit(function (err) {
                  if (err) {
                    return reject(err);
                  }
                  resolve(entity);
                });

              }).reflect();
            });

            return Promise.resolve()
              .then(function () {
                return Promise.all(promises)
                  .each(function (inspection) { //insepection API because we used `reflect()` above
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
              .then(function () {
                data.time.updateOrCreateCanonicalEntities += new Date().getTime() - start;
              });

          })
          .then(function updateMatchStateForSourceEntities() {

            var start = new Date().getTime();

            var d = new Date();

            //Tech: note: only updates _state.modifiedMatch and doesn't touch any other part.
            var updatedSourceEntityDTO = _.map(data.sourceObjects, function (v) {
              return {
                id: v.id,
                _state: {
                  modifiedMatch: d
                }
              };
            });

            return Promise.resolve()
              .then(function () {
                return tableSourceEntity.insert(updatedSourceEntityDTO, {
                  conflict: "update"
                });
              })
              .then(function () {
                data.time.updateMatchStateForSourceEntities += new Date().getTime() - start;
              });
          })
          .then(timerStats(data, start))
          .then(function () {
            //process all new sources by recursively fetching and processing all sourceEntities in batches
            if (data.state.nrOfResults === data.state.batch) {
              return processSourcesRecursive();
            }
          });
      })
      .catch(function (error) {
        err = error
      })
      .finally(function () {
        console.log("CREATE ENTITIES COMPLETE");
        redisClient.quit(); //quit
        r.getPoolMaster().drain(); //quit
        if (err) {
          reject(err);
        } else {
          resolve();
        }
      });
  });
};

var createReferences = function(generatedSchemas, argv){
  return new Promise(function (resolve) {
    var redisClient = redis.createClient(config.redis);
    var r = require('rethinkdbdash')(config.rethinkdb);
    var toolUtils = require("../../tools/utils")(generatedSchemas, r, redisClient);
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
        console.log("CREATE REFERENCES COMPLETE");
        redisClient.quit(); //quit
        r.getPoolMaster().drain(); //quit
        resolve();
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
  });


};

var populateERD = function(generatedSchemas, argv){
  return new Promise(function (resolve, reject) {
    var redisClient = redis.createClient(config.redis);
    var r = require('rethinkdbdash')(config.rethinkdb);
    var tableCanonicalEntity = r.table(domainUtils.statics.CANONICALTABLE);
    var tableERDEntity = r.table(domainUtils.statics.ERDTABLE);
    var entities = require("../../schemas/domain/entities")(generatedSchemas, r);
    var CanonicalEntity = entities.CanonicalEntity;
    var es_config = _.cloneDeep(config.elasticsearch);

    var client = new elasticsearch.Client(es_config);
    var data = _.cloneDeep({
      state: {
        total: 0,
        batch: 1000,
        nrOfResults: 0
      },
      time: {
        getEntities: 0,
        fetchRefs: 0,
        createDTOS: 0,
        populateRethinkERD: 0,
        populateES: 0,
        updateStateOfEntities: 0
      }
    });

    var start = new Date().getTime();

    var err;

    Promise.resolve()
      .then(function resetState() {
        if (argv.reset) {
          console.log(("Resetting _state.modifiedERD for testing").yellow);

          if (argv.id) {

            return tableCanonicalEntity.filter({
              id: argv.id
            }).update({
              _state: {
                modifiedERD: null
              }
            });

          } else if (argv.type) {

            return tableCanonicalEntity.filter(r.row('_type').contains(argv.type)).update({
              _state: {
                modifiedERD: null
              }
            });
          } else {
            return tableCanonicalEntity.update({
              _state: {
                modifiedERD: null
              }
            });
          }
        }
      })
      .then(function processSourcesRecursive() {
        return Promise.resolve()
          .then(function getEntities() {
            var start = new Date().getTime();

            return Promise.resolve()
              .then(function fetchRows() {

                // var .filter(r.row('_type').contains("Movie"))
                var getAll = tableCanonicalEntity.getAll(true, {
                  index: "modifiedERD"
                });

                if (argv.type) {
                  console.log(("Only processing: + " + argv.type).yellow);
                  getAll = getAll.filter(r.row('_type').contains(argv.type));
                } else if (argv.id) {
                  console.log(("Only processing: + " + argv.id).yellow);
                  getAll = getAll.filter({
                    id: argv.id
                  });
                }

                return getAll.limit(data.state.batch);

              })
              .then(function createCanonicalEntities(results) {

                //skip building aliases since that's not needed
                var options = {
                  skipAlias: true
                };

                return _.map(results, function (result) {
                  return new CanonicalEntity({
                    id: result.id,
                    type: result._type
                  }, result, options);
                });
              })
              .then(function (results) {
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
              .then(function () {
                return CanonicalEntity.fetchRefs(data.entities, true);
              })
              .then(function (refMap) {
                data.time.fetchRefs += new Date().getTime() - start;
                return refMap;
              });

          })
          .then(function createDTOS(refMap) {
            var start = new Date().getTime();

            return Promise.all(_.map(data.entities, function (entity) {

              return entity.toERDObject(refMap)
                .then(function hackToGetInImage(dto) {

                  //TODO: HACK: adding in 'image' which is _ref
                  //Got to find a good way to do this
                  if (entity._props.image) {
                    var imageArr = _.compact(_.pluck(entity._props.image, "_ref.url"));
                    if (imageArr.length) {
                      dto.image = imageArr;
                    }
                  }

                  return dto;
                });

            })).then(function (dtos) {
              data.time.createDTOS += new Date().getTime() - start;
              return dtos;
            });
          })
          .then(function populateERDS(dtos) {

            function populateRethinkERD() {
              var start = new Date().getTime();
              return Promise.resolve()
                .then(function () {

                  function recurseObjectToRemoveExpandKeys(dto) {

                    //dtos to rethink are the ES dtos with --expand + --* removed
                    return _.reduce(dto, function (agg, v, k) {

                      if (!~k.indexOf("--")) { //only keep stuff for which key doesn't have '--'
                        if (_.isArray(v)) {

                          v = _.compact(_.map(v, function (singleItem) {
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

                  var dtosRethink = _.map(_.cloneDeep(dtos), function createGeoInObjectForm(dto) {

                    //transform from internal (ES/GEOJSON) format [long,lat] to readable format
                    if (dto.geo) {
                      dto.geo = {
                        latitude: dto.geo[1],
                        longitude: dto.geo[0],
                      };
                    }
                    return dto;
                  });

                  dtosRethink = _.map(dtosRethink, recurseObjectToRemoveExpandKeys);


                  return tableERDEntity.insert(dtosRethink, {
                    conflict: "update"
                  });
                })
                .then(function () {
                  data.time.populateRethinkERD += new Date().getTime() - start;
                });
            }

            function populateES() {

              var start = new Date().getTime();

              var bulk = _.reduce(dtos, function (arr, dto) {

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
                .then(function () {
                  if (bulk.length) {
                    return Promise.resolve().then(function () {
                      return client.bulk({
                        body: bulk
                      });
                    })
                      .then(function (results) {
                        if (results.errors) {
                          var errors = _.filter(results.items, function (result) {
                            return result.index.status >= 300;
                          });
                          console.log("ERRORS IN ES BULK INSERT: REST OF BULK IS PERSISTED ************************");
                          console.log(JSON.stringify(errors, null, 2));
                        }
                      });
                  }
                })
                .then(function () {
                  data.time.populateES += new Date().getTime() - start;
                });
            }

            return Promise.all([populateRethinkERD(), populateES()]);
          })
          .then(function updateStateOfEntities() {

            var start = new Date().getTime();
            var d = new Date();

            var updatedEntitiesDTO = _.map(data.entities, function (v) {
              return {
                id: v.id,
                _state: {
                  modifiedERD: d
                }
              };
            });

            return Promise.resolve()
              .then(function () {
                return tableCanonicalEntity.insert(updatedEntitiesDTO, {
                  conflict: "update"
                });
              })
              .then(function () {
                data.time.updateStateOfEntities += new Date().getTime() - start;
              });

          })
          .then(timerStats(data, start))
          .then(function () {
            //process all new sources by recursively fetching and processing all sourceEntities in batches
            if (data.state.nrOfResults === data.state.batch) {
              return processSourcesRecursive();
            }
          });
      })
      .catch(function (error) {
        err = error;
      })
      .finally(function () {
        console.log("POPULATE ERD COMPLETE");
        redisClient.quit(); //quit
        r.getPoolMaster().drain(); //quit
        if (err) {
          reject(err);
        } else {
          resolve();
        }

      });

  });
};

var ingestData = function(generatedSchemas, argv){
  return new Promise(function(resolve, reject){
    console.log("BEGINNING INGESTION");
    createEntities(generatedSchemas, argv)
      .then(function() {
        createReferences(generatedSchemas, argv).then(
          function () {
            populateERD(generatedSchemas, argv).then(
              function () {
                console.log('INGESTION COMPLETE');
                resolve();
              })
          })
      })
      .catch(function(err){
        console.log("ERROR INGESTING:", err);
        reject(err);
      });
  })
};

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

module.exports = {
  createEntities: createEntities,
  createReferences: createReferences,
  populateERD: populateERD,
  ingestData: ingestData
};

