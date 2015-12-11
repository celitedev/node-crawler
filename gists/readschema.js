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



//EXAMPLE FROM https://schema.org/Person
			// {
			//   "@context": "http://schema.org",
			//   "@type": "Person",
			//   "address": {
			//     "@type": "PostalAddress",
			//     "addressLocality": "Seattle",
			//     "addressRegion": "WA",
			//     "postalCode": "98052",
			//     "streetAddress": "20341 Whitworth Institute 405 N. Whitworth"
			//   },
			//   "colleague": [
			//     "http://www.xyz.edu/students/alicejones.html",
			//     "http://www.xyz.edu/students/bobsmith.html"
			//   ],
			//   "email": "mailto:jane-doe@xyz.edu",
			//   "image": "janedoe.jpg",
			//   "jobTitle": "Professor",
			//   "name": "Jane Doe",
			//   "telephone": "(425) 123-4567",
			//   "url": "http://www.janedoe.com"
			// }

//THIS SEEMS WRONG SINCE COLLEQUE IS NOT EXPLICITLY SET TO BE OF TYPE @ID
//sO THIS IS BETTER? 
var test = {
  "@context": {
		"@vocab": "http://schema.org/",
		"colleague": { "@type": "@id" }
	},
  "@type": "Person",
  "address": {
    "@type": "PostalAddress",
    "addressLocality": "Seattle",
    "addressRegion": "WA",
    "postalCode": "98052",
    "streetAddress": "20341 Whitworth Institute 405 N. Whitworth"
  },
  "colleague": [
    "http://www.xyz.edu/students/alicejones.html",
    "http://www.xyz.edu/students/bobsmith.html"
  ],
  "email": "mailto:jane-doe@xyz.edu",
  "image": "janedoe.jpg",
  "jobTitle": "Professor",
  "name": "Jane Doe",
  "telephone": "(425) 123-4567",
  "url": "http://www.janedoe.com"
};
