var all = require("../schemas/schemaOrg/all.js");
var argv = require('yargs').argv;
var _ = require("lodash");

if (!argv.type) {
	throw new Error("commandline --type required");
}


var typeName = argv.type;

var type = all.types[typeName];

if (!type) {
	throw new Error("type not found for:" + typeName);
}

var schema = _.extend({}, type, {
	propertySchemas: _.map(type.properties, function(propName) {
		console.log(all.properties[propName].ranges);
		return _.pick(all.properties[propName], ["id", "ranges"]);
	})
});
// console.log(schema);
