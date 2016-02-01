var _ = require('lodash');
var urlRegex = require('url-regex');

module.exports = _.extend({}, require("./utilsForSchemaGeneration"), {

	transformers: {
		lowercase: function(val) {
			return val.toLowerCase();
		},
		uppercase: function(val) {
			return val.toUpperCase();
		},
		float: function(val) {
			return parseFloat(val);
		},
		geo: function(geoObj) {
			return [geoObj.longitude, geoObj.latitude]; //long first -> bit weird but this is the GeoJSON compliant way.
		}
	},

	//infer type from value when fieldtype has ambiguous range.
	//NOTE: validity of ambiguity solver for fieldtype is already checked
	//Also: type !== explicitType. This is already checked.
	inferTypeForAmbiguousRange: function(fieldtype, obj) {
		switch (fieldtype.ambiguitySolvedBy.type) {
			case "urlVsSomething":
				if (urlRegex({
						exact: true
					}).test(obj._value)) {
					return "URL";
				} else {
					//return the other thing. We know that there's exactly 2 elements, so...
					return _.filter(fieldtype.ranges, function(t) {
						return t !== "URL";
					})[0];
				}
				break;
			case "implicitType":
				//just assign the first type. It's guaranteed to be value by reference so we don't store
				//the (bogus) assigned type. 
				//This however, allows us to easily fake our way through the rest of the validation 
				//checks, which we can because they don't matter for this particular code-path.
				obj._isBogusType = true;
				return fieldtype.ranges[0];
			case "implicitDataType":
				return fieldtype.ambiguitySolvedBy.sharedParentDataType;
			default:
				throw new Error("Ambiguous solver not implemented: " + fieldtype.ambiguitySolvedBy.type);
		}
	},
	//Calc if type is allowed in range. 
	isTypeAllowedForRange: function(typeOrTypeName, fieldtype) {

		//Calculated by taking the intersection of the type (including it's ancestors) 
		//and the range and checking for non-empty.
		//We take the ancestors as well since type may be a subtype of any of the types defined in range.

		var type = _.isString(typeOrTypeName) ?
			generatedSchemas.types[typeOrTypeName] || generatedSchemas.datatypes[typeOrTypeName] :
			typeOrTypeName;

		var ancestorsAndSelf = _.uniq(type.ancestors.concat(type.id));
		return _.intersection(ancestorsAndSelf, fieldtype.ranges).length;
	},

	createDagOrderGeneric: function(dagComparatorMap) {

		var order = [];

		function itLoop(deps, k) {

			if (deps.length) {
				return;
			}

			order.push(k);

			_.each(dagComparatorMap, function(innerDeps) {
				var needle = innerDeps.indexOf(k);
				if (~needle) {
					innerDeps.splice(needle, 1);
				}
			});

			delete dagComparatorMap[k]; //delete type -> counts as stop crit
		}

		while (true) {

			var dagComparatorMapSizeStart = _.size(dagComparatorMap);

			//each iteration we need see the size of dagComparatorMap shrink
			//if not, we've got a cycle
			_.each(dagComparatorMap, itLoop);

			if (!_.size(dagComparatorMap)) {
				break; //done
			}

			if (_.size(dagComparatorMap) === dagComparatorMapSizeStart) {
				throw new Error("Cycle detected!");
			}
		}
		return order;
	},

	enums: {
		//kind of entity: 
		//- Canonical: our own caonical representation
		//- Source: 3rd party source representation
		kind: {
			"CANONICAL": "canonical",
			"SOURCE": "source"
		},
	},
	excludePropertyKeys: ["_type", "_value", "_isBogusType", "_ref"],
	statics: {
		SOURCETABLE: "sourceEntities",
		CANONICALTABLE: "entities",
		REFNORMS: "refNorms",
		REFX: "refX"
	}
});
