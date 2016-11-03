//TODO JIM Remove?
var producerUtils = require('../../producer/utils');

module.exports = function(job, done) {
  producerUtils.runProducer(job.attrs.data)
    .then(function () {
      return done();
    })
    .catch(function(err){
      return done(err)
    })
};