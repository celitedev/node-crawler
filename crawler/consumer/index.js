var _ = require("lodash");
var utils = require('../utils');
var consumerUtils = require('./utils');
var argv = require('yargs').argv;

consumerUtils.runConsumer(_.extend(argv, {generatedSchemas: utils.generateSchemas()})).done();
