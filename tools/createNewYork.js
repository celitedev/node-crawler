var _ = require("lodash");
var Promise = require("bluebird");

var generatedSchemas = require("../schemas/domain/createDomainSchemas.js")({
  checkSoundness: true,
  config: require("../schemas/domain/_definitions/config"),
  properties: require("../schemas/domain/_definitions").properties,
  types: require("../schemas/domain/_definitions").types,
  schemaOrgDef: require("../schemas/domain/_definitions/schemaOrgDef")
});

var config = require("../config");
var r = require('rethinkdbdash')(config.rethinkdb);

var entities = require("../schemas/domain/entities")(generatedSchemas, r);
var SourceEntity = entities.SourceEntity;

var nycObject = require("../schemas/domain/_definitions/config").statics.NYC;

return Promise.resolve()
  .then(function (dto) {

    return new Promise(function (resolve, reject) {

      var entity = new SourceEntity({
        sourceType: "manual",
        batchId: 1,
        detailPageAware: false,
        type: "Place",
        id: nycObject.id,
        sourceId: nycObject.sourceId
      });

      entity.set({
        name: "new york city",
      });

      entity.commit(function (err) {
        if (err) {
          return reject(err);
        }
        resolve(entity);
      });
    });
  })
  .catch(function (err) {
    throw err;
  })
  .finally(function () {
    console.log("QUITTING");
    r.getPoolMaster().drain(); //quit
  });
