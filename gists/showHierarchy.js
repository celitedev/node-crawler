var generatedSchemas = require("../schemas/createDomainSchemas.js");
var argv = require('yargs').argv;
var _ = require("lodash");


var types = _.cloneDeep(generatedSchemas.types);
var hierarchy = {};
var typePrefix = {};
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

printHierarchy(hierarchy);

function printHierarchy(hier, prefix) {
	_.each(hier, function(innerHier, k) {

		var name = !prefix ? k : prefix + " -> " + k;
		console.log(name);
		printHierarchy(innerHier, name);
	});
}
