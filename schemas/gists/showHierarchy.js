var generatedSchemas = require("../createDomainSchemas.js");
var argv = require('yargs').argv;
var _ = require("lodash");

var utils = require("../utils");

utils.printHierarchy(generatedSchemas.types);
