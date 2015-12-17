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

	if (argv.excludeDataTypes) {
		console.log(("Excluding datatypes").yellow);
	}
	if (argv.transitive) {
		console.log(("Transitive Walk").red);


		if (!argv.roots) {
			//e.g: ["AggregateRating", "ImageObject", "Review"];
			throw new Error("option `transitive` also requires option `roots`. I.e.: a comma-delimited collection of Root Objects. " +
				"Traversing (transitive walk) doesn't cross these root object boundaries.");
		}

		//AggregateRating,ImageObject,Review

		//Total example: node schemas/gists/showSchemas --type=Place --command=outbound --excludeDataTypes --transitive --roots=AggregateRating,ImageObject,Review
		stopRecursionAt = argv.roots.split(",");
	}

	function children(type) {
		return _.reduce(type.properties, function(agg, p, propName) {
			var ranges = argv.excludeDataTypes ? _.intersection(_.keys(generatedSchemas.types), p.ranges) : p.ranges;
			if (ranges.length) {
				agg[type.id + "." + propName] = ranges;
			}
			return agg;
		}, {});
	}

	function walkRec(type, ancestors) {
		var childObj = children(type);
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
					if (!_.intersection(typeChainRec, ancestors).length) {
						var obj = range[i] = {};
						obj[tNameRec] = walkRec(typeRec, ancestors.concat([tNameRec]));
					}
				}
			}

			//simplify display: if range only has 1 element -> take that 1 el instead of range
			if (range.length === 1) {
				childObj[typeAndAttributeRef] = range[0];
			}

		});
		return childObj;
	}

	if (!argv.transitive) {
		console.log(children(type));
	} else {
		var typeChainExThing = _.difference(typeChain, ["Thing"]);
		var result = walkRec(type, stopRecursionAt.concat(typeChainExThing));
		console.log(JSON.stringify(result, null, 2));
	}
}


// function ambiguous() {

// 	//if Text + Url supported we can get by by just having Text. So don't flag as ambiguous
// 	if (argv.excludeDataSubtypes) {
// 		console.log(("Exclude datasubtypes").yellow);
// 	}

// 	var datatypes = generatedSchemas.datatypes;

// 	var results = {},
// 		alreadyCovered = [];
// 	var typesInDagOrder = utils.getTypesInDAGOrder(generatedSchemas.types);

// 	_.each(typesInDagOrder, function(tName) {

// 		var t = generatedSchemas.types[tName];
// 		_.each(t.properties, function(p, pName) {

// 			if (alreadyCovered.indexOf(pName) !== -1) return; //already tackecled by a parent type

// 			var i = 0;
// 			var ranges = _.reduce(p.ranges, function(arr, rName) {
// 				var range = datatypes[rName];
// 				if (range) {

// 					console.log(p.ranges);
// 					// //range should only be added if supertype isn't avail as well.
// 					// //In that case we can make do with the supertype encoding and do validation 
// 					// //on subtype to recognize 

// 					// var rangeClone = _.clone(p.ranges);
// 					// rangeClone.splice(i, 1); //delete own el
// 					// if (!_.intersection(rangeClone, range.ancestors).length) {
// 					// 	if (rName === "URL") {
// 					// 		console.log("AAAAAAAAAAAAAAAa", p.ranges);
// 					// 	}
// 					// 	arr.push(rName);
// 					// 	console.log("DATATYPES", rName);
// 					// }

// 				} else {
// 					//type should be added
// 					arr.push(rName);
// 				}
// 				i++;
// 				return arr;
// 			}, []);

// 			if (p.ranges.length > 1) {
// 				alreadyCovered.push(pName);
// 				var obj = results[tName] = results[tName] || {};
// 				obj[pName] = p.ranges;
// 			}
// 		});
// 	});
// 	console.log(results);
// }
