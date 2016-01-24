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

	var roots;
	var ambiguousRangesOnly = argv.ambiguousRangesOnly;
	var isTransitive = argv.transitive;

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

	if (isTransitive) {
		console.log(("--transitive IS specified").green);

		if (argv.roots) {
			console.log(("Going with overwritten roots as defined through --roots-commandline: " + argv.roots).yellow);
		} else {
			console.log(("Going with default roots as specified in Config: " + config.domain.roots.join(",")).yellow);
		}
	} else {
		console.log(("--transitive NOT specified").green);
	}

	roots = argv.roots ? argv.roots.split(",") : config.domain.roots;

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

						if (tNameRec === "Thing") { //Thing should never be expanded regardless if root
							continue;
						}
						var obj = range[i] = {};
						var subgraph = walkRec(typeRec, ancestors.concat([tNameRec]), true);

						if (ambiguousRangesOnly && _.isObject(subgraph) && !_.size(subgraph)) {
							delete obj[tNameRec];
						} else {
							obj[tNameRec] = subgraph;
						}
					}
				}
			}

			///////////////////////////////////////////////
			//Simplify display for easier consumption // //
			///////////////////////////////////////////////

			//simplify display: if range only has 1 element -> take that 1 el instead of range
			if (range.length === 1) {
				if (ambiguousRangesOnly && (_.isString(range[0]) || !_.size(range[0]))) {
					//delete non ambiguous ranges iff: 
					//- not expanded (so string)
					//- expanded (object) but empty object (bc it was preuned earlier -> see ambiguousRangesOnly ref above)
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

			var kv = childObj[typeAndAttributeRef];

		});
		return childObj;
	}

	var typeChainExThing = _.difference(typeChain, ["Thing"]);
	var stopRecursionAt = roots.concat(typeChainExThing);

	var resultTotal = {};
	if (!argv.includeSubtypes) {
		resultTotal = walkRec(type, stopRecursionAt);
	} else {

		var propsAdded = [];
		_.each(utils.getTypesInDAGOrder(generatedSchemas.types, typeName), function(typeNewIt) {
			var t = generatedSchemas.types[typeNewIt];
			var result = walkRec(t, stopRecursionAt);

			if (!argv.stopSubtypesAtRoot) {
				doWork();
			} else if (typeName === typeNewIt) { //specified type -> process
				doWork();
			} else {
				//let's check if current subtype isn't hooked to a 'lower' root or it that root itself
				//If so -> skip

				var ancestorsAndSelf = _.uniq(t.ancestors.concat(typeNewIt));

				var indexOfSpecifiedType = ancestorsAndSelf.indexOf(typeName);
				var highestRootIndex = _.reduce(roots, function(i, rootType) {
					//we make use of fact that ancestors-attrib is ordered so that lowest-root is last in array
					return Math.max(i, ancestorsAndSelf.indexOf(rootType));
				}, -1);

				// console.log(typeNewIt, indexOfSpecifiedType, highestRootIndex, ancestorsAndSelf.join(","));
				if (indexOfSpecifiedType >= highestRootIndex) {
					doWork();
				}
			}

			function doWork() {
				_.each(result, function(v, k) {
					var propName = k.substring(k.lastIndexOf("."));
					if (propsAdded.indexOf(propName) === -1) {
						resultTotal[k] = v;
						propsAdded.push(propName);
					}
				});
			}

		});
	}

	console.log(JSON.stringify(resultTotal, null, 2));

}
