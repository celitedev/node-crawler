var argv = require('yargs').argv;
var _ = require("lodash");
var colors = require("colors");


if (!argv.type) {
	throw new Error("commandline --type required");
}

var utils = require("../utils");
var generatedSchemas = require("../createDomainSchemas.js");


var typeName = argv.type;
var type = generatedSchemas.types[typeName];
var typeChain = _.uniq(_.clone(type.ancestors).concat(typeName));

if (!type) {
	throw new Error("type not found for:" + typeName);
}

var commands = ["typesIn", "referBy", "referTo"];

var command = argv.command;
if (!command || commands.indexOf(command) === -1) {
	throw new Error("commandline --command required. Available options: " + commands.join(","));
}


switch (command) {
	case "schema":
		console.log(_.keys(type.properties));
		break;
	case "referBy":
		referBy();
		break;
	case "referTo":
		referTo();
		break;
}

function propertiesReferencingType() {
	var propNames = _.reduce(generatedSchemas.properties, function(arr, p, propName) {
		if (p.ranges.indexOf(typeName) !== -1) {
			arr.push(propName);
		}
		return arr;
	}, []);
	return propNames;
}

//referredBy
function referBy() {

	var results = {},
		alreadyCovered = [],
		typesInDagOrder = utils.getTypesInDAGOrder(generatedSchemas.types);

	_.each(typesInDagOrder, function(tName) {

		var t = generatedSchemas.types[tName];
		_.each(t.properties, function(p, propName) {
			var interSect = _.intersection(typeChain, p.ranges);
			if (interSect.length) {
				var key = tName + "." + propName;
				var isAlreadyCovered = false;
				_.each(t.supertypes, function(superName) {
					if (alreadyCovered.indexOf(superName + "." + propName) !== -1) {
						isAlreadyCovered = true;
					}
				});
				if (!isAlreadyCovered) {
					results[key] = interSect;
				}
				alreadyCovered.push(key);
			}
		});
	});
	console.log(results);
}

function referTo() {

}
