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

function outbound() {

	var stopRecursionAt;
	var ambiguousRangesOnly = argv.ambiguousRangesOnly;
	var isTransitive = argv.transitive;

	if (argv.excludeDataTypes) {
		console.log(("Excluding datatypes").yellow);
	}

	if (argv.ambiguousRangesOnly && argv.excludeDataTypes) {
		throw new Error("--excludeDataTypes doesn't make sense when --ambiguousRangesOnly=true");
	}

	if (argv.ambiguousRangesOnly) {
		console.log(("show ambiguous only").green);
	}

	if (isTransitive) {
		console.log(("Transitive Walk").red);

		if (!argv.roots) {
			//e.g: ["AggregateRating", "ImageObject", "Review"];
			throw new Error("option `transitive` also requires option `roots`. I.e.: a comma-delimited collection of Root Objects. " +
				"Traversing (transitive walk) doesn't cross these root object boundaries.");
		}

		//AggregateRating,ImageObject,Review

		//Total example: node schemas/gists/showSchemas --type=Place --command=outbound --excludeDataTypes --transitive --roots=AggregateRating,ImageObject,Review
	}

	stopRecursionAt = (argv.roots || []).split(",");

	function children(type, isDeep) {
		return _.reduce(type.properties, function(agg, p, propName) {
			var ranges = argv.excludeDataTypes ? _.intersection(_.keys(generatedSchemas.types), p.ranges) : p.ranges;
			if (ranges.length) {
				var key = isDeep ? propName : type.id + "." + propName;
				agg[key] = ranges;
			}
			return agg;
		}, {});
	}

	function walkRec(type, ancestors, isDeep) {
		var childObj = children(type, isDeep);
		_.each(childObj, function(range, typeAndAttributeRef) {

			//iterate range for particular typeAndAttributeRef
			for (var i = 0; i < range.length; i++) {
				var tNameRec = range[i];

				//iterate all types in the range. 
				var typeRec = generatedSchemas.types[tNameRec];
				if (typeRec) { //only continue if type instead of primitive datatype

					//create typeChain (all ancestors plus self) for current type
					var typeChainRec = _.uniq(_.clone(typeRec.ancestors).concat(tNameRec));

					//For all types (incl supertypes) not already traversed along this path > recurse
					if (!_.intersection(typeChainRec, ancestors).length && (isTransitive || (!isTransitive && isDeep))) {
						var obj = range[i] = {};
						var subgraph = walkRec(typeRec, ancestors.concat([tNameRec]), true);
						obj[tNameRec] = subgraph;
					}
				}
			}

			if (ambiguousRangesOnly) {
				//TODO: don't treat [URL,Text] as ambiguous since supertype(URL) = Text
				//This should be done for: 
				//- datatypes
				//- types as long as both below to the same root.
			}


			///////////////////////////////////////////////
			//Simplify display for easier consumption // //
			///////////////////////////////////////////////

			//simplify display: if range only has 1 element -> take that 1 el instead of range
			if (range.length === 1) {
				if (ambiguousRangesOnly && _.isString(range[0])) {

					//delete non ambiguous ranges iff not expanded, so focus is on problem areas. 
					delete childObj[typeAndAttributeRef];
				} else {
					childObj[typeAndAttributeRef] = range[0];
				}
			} else { //possible ambiguous range

				//condesnse ambiguous range to string (comma-separated) if all elements are string
				if (!_.filter(range, _.isObject).length) {
					childObj[typeAndAttributeRef] = range.join(",");
				}
			}


		});
		return childObj;
	}

	var typeChainExThing = _.difference(typeChain, ["Thing"]);
	var result = walkRec(type, stopRecursionAt.concat(typeChainExThing));

	// console.log(result);
	console.log(JSON.stringify(result, null, 2));

}
