var producerUtils = require('./utils');
var argv = require('yargs').argv;

producerUtils.runProducer(argv).done();
