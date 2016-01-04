var argv = require('yargs').argv;
var _ = require("lodash");
var colors = require('colors');
var utils = require("../../domain/utils");

var config = require("../../domain/_definitions/config");

var commands = ["typeHierarchy", "allDefined", "ambiguous"];

var command = argv.command;
if (!command || commands.indexOf(command) === -1) {
	throw new Error("commandline --command required. Available options: " + commands.join(","));
}

var generatedSchemas = require("../../domain/createDomainSchemas.js")({
	checkSoundness: argv.soundness
});

switch (command) {
	case "typeHierarchy":
		if (argv.fromRoot) {
			console.log(("printing hierarchy starting from root=" + argv.fromRoot).yellow);
		} else {
			console.log(("printing entire hierarchy. You know you can limit this with --fromRoot right?").yellow);
		}
		utils.printHierarchy(generatedSchemas.types, argv.fromRoot);
		break;
	case "ambiguous":
		ambiguous(generatedSchemas.types);
		break;
	case "allDefined":
		//check if all types are defined as root|isAbstract|isValueObject
		allDefined(generatedSchemas.types);
		break;
}

function ambiguous(types) {

	if (argv.hideAmbiguitySolved) {
		console.log(("Hiding ambiguous items if ambigutiySolved").yellow);
	} else {
		console.log(("Showing all ambiguous even if solved. Can change with --hideAmbiguitySolved").yellow);
	}

	var removeIfSolved = argv.hideAmbiguitySolved;
	var order = utils.getTypesInDAGOrder(types);
	var props = [];
	var out = {};
	_.each(order, function(typeName) {
		var type = types[typeName];
		_.each(type.properties, function(prop, propName) {
			// var prop = generatedSchemas.properties[propName];
			if (props.indexOf(propName) !== -1) return;
			if (prop.isAmbiguous && (!removeIfSolved || (!prop.isAmbiguitySolved && removeIfSolved))) {
				out[typeName + "." + propName] = prop.ranges.join(",");
			}
			props.push(propName);
		});
	});
	console.log(JSON.stringify(out, null, 2));
}

function allDefined(types) {

	if (argv.onlyShowErrors) {
		console.log(("only showing errors").yellow);
	} else {
		console.log(("showing errors and non errors. Can be changed with supplying --onlyShowErrors").yellow);
	}

	var out = {
		errors: {
			all3: [],
			abstractAndValueObject: [],
			abstractAndEntity: [],
			entityAndValueObject: [],
			none: []
		},
		valueObjects: [],
		abstract: [],
		entity: {

		}
	};
	_.each(types, function(t) {
		var id = t.id;
		if (t.isAbstract && t.isValueObject && t.isEntity) {
			out.errors.all3.push(id);
		} else if (!(t.isAbstract || t.isValueObject || t.isEntity)) {
			out.errors.none.push(id);
		} else if (t.isAbstract && t.isValueObject) {
			out.errors.abstractAndValueObject.push(id);
		} else if (t.isAbstract && t.isEntity) {
			out.errors.abstractAndEntity.push(id);
		} else if (t.isEntity && t.isValueObject) {
			out.errors.entityAndValueObject.push(id);
		} else if (t.isAbstract) {
			out.abstract.push(id);
		} else if (t.isValueObject) {
			out.valueObjects.push(id);
		} else {
			//entity
			var arr = out.entity[t.rootName] = out.entity[t.rootName] || [];
			arr.push(id);
		}
	});

	if (argv.onlyShowErrors) {
		out = out.errors;
	}
	console.log(JSON.stringify(out, null, 2));

}
