var utils = require('../utils');
var ingestionUtils = require('./utils');
var argv = require('yargs').argv;

ingestionUtils.populateERD(utils.generateSchemas(),argv).done();