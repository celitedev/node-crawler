var generatedSchemas = require("../createDomainSchemas.js");
var argv = require('yargs').argv;
var _ = require("lodash");

var utils = require("../utils");

var commands = ["typeHierarchy"];

var command = argv.command;
if (!command || commands.indexOf(command) === -1) {
	throw new Error("commandline --command required. Available options: " + commands.join(","));
}

switch (command) {
	case "typeHierarchy":
		utils.printHierarchy(generatedSchemas.types);
		break;
}
