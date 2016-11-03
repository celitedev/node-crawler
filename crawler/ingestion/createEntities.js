var utils = require('../utils');
var ingestionUtils = require('./utils');
var argv = require('yargs').argv;

ingestionUtils.createEntities(utils.generateSchemas(), argv).done();