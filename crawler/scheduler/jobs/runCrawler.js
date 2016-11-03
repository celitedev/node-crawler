var utils = require('../../utils');
var producerUtils = require('../../producer/utils');
var consumerUtils = require('../../consumer/utils');
var ingestionUtils = require('../../ingestion/utils');

var generatedSchemas = utils.generateSchemas();

module.exports = function(job, done) {
  producerUtils.runProducer({
    name: job.attrs.data.crawler,
    forceNewBatch: true
  })
    .then(function(){ consumerUtils.runConsumer({name: job.attrs.data.crawler, generatedSchemas: generatedSchemas})
    .then(function(){ ingestionUtils.ingestData(generatedSchemas, {})
    .then(function(){ return done() })})})
    .catch(function(err){
      console.log("err", err);
      return done(err)
    })
};