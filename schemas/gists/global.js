var generatedSchemas = require("../createDomainSchemas.js");
var argv = require('yargs').argv;
var _ = require("lodash");
var colors = require('colors');
var utils = require("../utils");

var commands = ["typeHierarchy", "allDefined"];

var command = argv.command;
if (!command || commands.indexOf(command) === -1) {
	throw new Error("commandline --command required. Available options: " + commands.join(","));
}

switch (command) {
	case "typeHierarchy":
		utils.printHierarchy(generatedSchemas.types);
		break;
	case "allDefined":
		//check if all types are defined as root|isAbstract|isValueObject
		allDefined(generatedSchemas.types);
}

function allDefined(types) {

	if (!argv.roots) {
		//e.g: ["AggregateRating", "ImageObject", "Review"];
		throw new Error("option `roots` required. I.e.: a comma-delimited collection of Root Objects.");
	}

	var roots = argv.roots.split(",");

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
