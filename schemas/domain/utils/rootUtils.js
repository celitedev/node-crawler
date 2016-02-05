var _ = require("lodash");
var utils = require("./index");


module.exports = function(generatedSchemas) {

	function getPropertyMapForType(typeName, roots) {
		var options = {
			type: typeName,
			includeSubtypes: true,
			stopSubtypesAtRoot: true
		};
		return outboundCalc(roots, options);
	}

	function outboundCalc(roots, options) {

		var typeName = options.type;
		var type = generatedSchemas.types[typeName];

		if (!type) {
			throw new Error("type not found for:" + typeName);
		}

		var typeChain = _.uniq(_.clone(type.ancestors).concat(typeName));


		function children(type, isDeep) {
			return _.reduce(type.properties, function(agg, p, propName) {
				var ranges = options.excludeDataTypes ? _.intersection(_.keys(generatedSchemas.types), p.ranges) : p.ranges;
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

						if (!_.intersection(typeChainRec, ancestors).length && (options.isTransitive || (!options.isTransitive && isDeep))) {

							if (tNameRec === "Thing") { //Thing should never be expanded regardless if root
								continue;
							}
							var obj = range[i] = {};
							var subgraph = walkRec(typeRec, ancestors.concat([tNameRec]), true);

							if (options.ambiguousRangesOnly && _.isObject(subgraph) && !_.size(subgraph)) {
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
					if (options.ambiguousRangesOnly && (_.isString(range[0]) || !_.size(range[0]))) {
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
		if (!options.includeSubtypes) {
			resultTotal = walkRec(type, stopRecursionAt);
		} else {

			var propsAdded = [];
			_.each(utils.getTypesInDAGOrder(generatedSchemas.types, typeName), function(typeNewIt) {
				var t = generatedSchemas.types[typeNewIt];
				var result = walkRec(t, stopRecursionAt);

				if (!options.stopSubtypesAtRoot) {
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
		return resultTotal;

	}

	return {
		getPropertyMapForType: getPropertyMapForType,
		outboundCalc: outboundCalc
	};
};
