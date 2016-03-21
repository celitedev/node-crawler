var argv = require('yargs').argv;
var _ = require("lodash");
var colors = require("colors");
var config = require("../../domain/_definitions/config");

if (!argv.type) {
	throw new Error("commandline --type required");
}


var utils = require("../../domain/utils");

var generatedSchemas = require("../../domain/createDomainSchemas.js")({
	checkSoundness: argv.soundness,
	config: require("../../domain/_definitions/config"),
	properties: require("../../domain/_definitions").properties,
	types: require("../../domain/_definitions").types,
	schemaOrgDef: require("../../domain/_definitions/schemaOrgDef")
});

var rootUtils = require("../../domain/utils/rootUtils")(generatedSchemas);

var typeName = argv.type;
var type = generatedSchemas.types[typeName];

if (!type) {
	throw new Error("type not found for:" + typeName);
}

var typeChain = _.uniq(_.clone(type.ancestors).concat(typeName));

var commands = ["schema", "schemafull", "inbound", "outbound", "ambiguous"];

var command = argv.command;
if (!command || commands.indexOf(command) === -1) {
	throw new Error("commandline --command required. Available options: " + commands.join(","));
}

switch (command) {
	case "schema":
		delete type.specific_properties;
		type.properties = _.map(type.properties, function(prop) {
			var obj = {};
			obj[prop.id] = prop.ranges.join(",");
			return obj;
		});
		console.log(JSON.stringify(type, null, 2));
		break;
	case "schemafull":
		delete type.specific_properties;
		type.properties = _.map(type.properties, function(prop) {
			delete prop.comment;
			delete prop.comment_plain;
			delete prop.label;
			return prop;
		});
		console.log(type);
		break;
	case "inbound":
		inbound();
		break;
	case "outbound":
		outbound();
		break;
	case "ambiguous":
		// ambiguous();
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

function inbound() {

	var results = {},
		alreadyCovered = [],
		typesInDagOrder = utils.getTypesInDAGOrder(generatedSchemas.types);

	var typeChainUpToRoot = _.clone(typeChain);

	//e.g.: references to CreativeWork are not shown for Review, since Review is a different Root
	//see: https://github.com/Kwhen/crawltest/issues/83
	if (type.isEntity) {
		typeChainUpToRoot = typeChainUpToRoot.slice(typeChainUpToRoot.indexOf(type.rootName));
	}

	_.each(typesInDagOrder, function(tName) {
		var t = generatedSchemas.types[tName];
		_.each(t.properties, function(p, propName) {
			var interSect = _.intersection(typeChainUpToRoot, p.ranges);
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



function outbound() {


	if (argv.excludeDataTypes) {
		console.log(("--excludeDataTypes IS specified").yellow);
	} else {
		console.log(("--excludeDataTypes NOT specified").green);
	}

	if (argv.ambiguousRangesOnly && argv.excludeDataTypes) {
		throw new Error("--excludeDataTypes doesn't make sense when --ambiguousRangesOnly=true");
	}

	if (argv.ambiguousRangesOnly) {
		console.log(("--ambiguousRangesOnly IS specified").green);
	} else {
		console.log(("--ambiguousRangesOnly NOT specified").green);
	}

	if (argv.includeSubtypes) {
		console.log(("--includeSubtypes IS specified").green);

		if (argv.stopSubtypesAtRoot) {
			console.log(("--stopSubtypesAtRoot IS specified").green);
		} else {
			console.log(("--stopSubtypesAtRoot NOT specified").green);
		}

	} else {
		console.log(("--includeSubtypes NOT specified").green);
	}

	if (argv.isTransitive) {
		console.log(("--isTransitive IS specified").green);

		if (argv.roots) {
			console.log(("Going with overwritten roots as defined through --roots-commandline: " + argv.roots).yellow);
		} else {
			console.log(("Going with default roots as specified in Config: " + config.domain.roots.join(",")).yellow);
		}
	} else {
		console.log(("--isTransitive NOT specified").green);
	}

	var roots = argv.roots ? argv.roots.split(",") : config.domain.roots;

	var resultTotal = rootUtils.outboundCalc(roots, argv);


	console.log(JSON.stringify(resultTotal, null, 2));

}
