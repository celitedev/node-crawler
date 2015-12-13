var generatedSchemas = require("../schemas/generate.js");
var argv = require('yargs').argv;
var _ = require("lodash");

if (!argv.type) {
	throw new Error("commandline --type required");
}

var typeName = argv.type;

var type = generatedSchemas.types[typeName];

if (!type) {
	throw new Error("type not found for:" + typeName);
}

// console.log(type);

// var schema = _.extend({}, type, {
// 	propertySchemas: _.map(type.properties, function(propName) {
// 		console.log(generatedSchemas.properties[propName].ranges);
// 		return _.pick(generatedSchemas.properties[propName], ["id", "ranges"]);
// 	})
// });

// console.log(schema);
