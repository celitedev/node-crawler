//TODO JIM Remove?
var utils = require('../../utils');
var ingestionUtils = require('../../ingestion/utils');

module.exports = function(job, done) {
  console.log("BEGINNING INGESTION");
  var generatedSchemas = utils.generateSchemas();
  ingestionUtils.createEntities(generatedSchemas, {})
    .then(function(){
      ingestionUtils.createReferences(generatedSchemas, {}).then(function(){
        ingestionUtils.populateERD(generatedSchemas, {}).then(function(){
          return done();
        })
      })
    })
    .catch(function(err){
      console.log("ERROR INGESTING:", err);
      return done(err);
    });
};
