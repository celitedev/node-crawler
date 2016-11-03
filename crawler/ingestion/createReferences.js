var utils = require('../utils');
var ingestionUtils = require('./utils');
var argv = require('yargs').argv;

ingestionUtils.createReferences(utils.generateSchemas(),argv).done();