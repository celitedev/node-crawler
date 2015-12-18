var _ = require('lodash');

var module = module.exports = {
	//Generate DAG (directed acyclic graph) of schemas
	//correctly errors out on cycle
	generateDAG: function(inputTypes) {
		var types = _.cloneDeep(inputTypes);
		var hierarchy = {};
		var typePrefix = {},
			order = [];

		while (true) {
			var typesWithoutDepsInThisIt = 0;
			_.each(types, function(t, k) {
				if (t.supertypes.length) {
					// console.log(k);
					return;
				}

				typesWithoutDepsInThisIt++; //detect cycle

				//we've found a type without deps -> create array
				var hierForType = typePrefix[k];
				var arr;
				if (!hierForType) {
					arr = hierarchy[k] = {};
				} else {
					// console.log(hierForType);
					arr = _.property(hierForType)(hierarchy)[k] = {};
				}
				order.push(k);

				_.each(types, function(innerT, innerK) {
					if (innerT.supertypes.indexOf(k) !== -1) {
						innerT.supertypes.splice(innerT.supertypes.indexOf(k), 1);
						typePrefix[innerK] = hierForType ? hierForType + "." + k : k; //assign hierarchyPrefix
						// arr.push(innerK);
					}
				});

				delete types[k]; //delete type -> counts as stop crit
			});
			if (!_.size(types)) {
				break; //done
			}
			if (!typesWithoutDepsInThisIt) {
				throw new Error("Cycle detected!");
			}
		}
		return {
			hierarchy: hierarchy,
			order: order
		};
	},
	printHierarchy: function(inputTypes) {
		module._printHierarchy(module.generateDAG(inputTypes).hierarchy);
	},

	_printHierarchy: function(hier, prefix) {
		_.each(hier, function(innerHier, k) {

			var name = !prefix ? k : prefix + " -> " + k;
			console.log(name);
			module._printHierarchy(innerHier, name);
		});
	},

	//return an array of typeNames for which the order is such that supertpes 
	//always come before subtypes
	//
	//Tech: return a breadth-first search soluation over the DAG.
	getTypesInDAGOrder: function(inputTypes) {
		return module.generateDAG(inputTypes).order;
	}

};
