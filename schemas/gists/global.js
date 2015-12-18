var generatedSchemas = require("../createDomainSchemas.js");
var argv = require('yargs').argv;
var _ = require("lodash");
var colors = require('colors');
var utils = require("../utils");

var config = require("../config");

var commands = ["typeHierarchy", "allDefined", "ambiguous"];

var command = argv.command;
if (!command || commands.indexOf(command) === -1) {
	throw new Error("commandline --command required. Available options: " + commands.join(","));
}

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
	var order = utils.getTypesInDAGOrder(types);
	var props = [];
	var out = {};
	_.each(order, function(typeName) {
		var type = types[typeName];
		_.each(type.properties, function(prop, propName) {
			if (props.indexOf(propName) !== -1) return;
			if (prop.ranges.length > 1) {
				out[typeName + "." + propName] = prop.ranges.join(",");
			}
			props.push(propName);
		});
	});
	console.log(JSON.stringify(out, null, 2));
}

function allDefined(types) {

	if (argv.roots) {
		console.log(("Going with overwritten roots as defined through --roots-commandline: " + argv.roots).yellow);
	} else {
		console.log(("Going with default roots as specified in Config: " + config.domain.roots.join(",")).yellow);
	}

	var roots = argv.roots ? argv.roots.split(",") : config.domain.roots;

	var obj = utils.generateDAG(types);
	var hierarchy = obj.hierarchy;

	var out = {
		errors: {
			undef: [],
			rootCovered: {
				isAbstract: [],
				isValueObject: []
			},
			abstractAndValueObject: []
		},
		isValueObject: [],
		isAbstract: [],
		roots: {
			// array per root
		}
	};

	walk(hierarchy);

	function walk(tree, rootNameSuper) {
		_.each(tree, function(struct, name) {
			var node = generatedSchemas.types[name];
			var rootName = rootNameSuper;
			if (roots.indexOf(name) !== -1) {
				//FACT: node defined as root
				rootName = name;
			}
			if (rootName) {
				//FACT: node is root or covered by root

				//CHECK: should not define isAbstract
				if (node.isAbstract) {
					out.errors.rootCovered.isAbstract.push(name);
					return;
				}

				//CHECK: should not define isValueObject
				if (node.isValueObject) {
					out.errors.rootCovered.isValueObject.push(name);
					return;
				}

				var agg = out.roots[rootName] = out.roots[rootName] || [];
				agg.push(name);

			} else {
				if (node.isAbstract && node.isValueObject) {
					out.errors.abstractAndValueObject.push(name);
				} else if (node.isAbstract) {
					out.isAbstract.push(name);
				} else if (node.isValueObject) {
					out.isValueObject.push(name);
				} else {
					out.errors.undef.push(name);
				}
			}
			//recurse
			walk(struct, rootName);
		});
	}
	if (argv.onlyShowErrors) {
		console.log(("only showing errors").yellow);
		out = out.errors;
	}
	console.log(JSON.stringify(out, null, 2));
}
