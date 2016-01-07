var argv = require('yargs').argv;
var _ = require("lodash");


var generatedSchemas = require("../../domain/createDomainSchemas.js")({
	checkSoundness: true,
	config: require("../../domain/_definitions/config"),
	properties: require("../../domain/_definitions").properties,
	types: require("../../domain/_definitions").types,
	schemaOrgDef: require("../../domain/_definitions/schemaOrgDef")
});

var domainObjects = require("../../domain/DomainObjects")(generatedSchemas);
var CanonicalObject = domainObjects.CanonicalObject;
var SourceObject = domainObjects.SourceObject;

var domainUtils = require("../../domain/utils");


// var domainObject = new SourceObject({
// 	type: ["CreativeWork"],
// 	sourceType: "eventful",
// 	sourceUrl: "url of entity as known at source", //required
// 	sourceId: "id of entity as known at source" //optional
// });

// domainObject.set({
// 	name: "Home asdasdasd",
// 	url: "http://www.google.com",
// 	about: "some id", //transformed to _ref.sourceId
// 	producer: "https://en.wikipedia.org/wiki/Quentin_Tarantino" //transformed to _ref.sourceUrl
// });



var domainObject = new SourceObject({
	type: ["Restaurant", "BarOrPub"],
	sourceType: "eventful",
	sourceUrl: "url of entity as known at source", //required
	sourceId: "id of entity as known at source" //optional
});

domainObject.set({
	address: {
		addressLocality: "Tilburg",
		postalCode: "5021 GW",
		streetAddress: "stuivesantplein 7",
		email: "GBRITS@ASDASD.COM"
	},
	geo: {
		latitude: 43.123123,
		longitude: 12.123213,
		elevation: 1,
		// test: 43.123123,
	},
	name: "testasd",
	menu: "italian",
	alternateName: ["asd", "asd"],
});



domainObject.commit(function(err) {
	if (err) {
		//validation errors are an error on commit
		console.log(domainObject._state.errors);
		throw err;
	}
	//POST: isDirty = false
	// console.log(JSON.stringify(domainObject, null, 2));
	console.log(JSON.stringify(domainObject.toDataObject(), null, 2));
	// console.log(JSON.stringify(domainObject.toSimple(), null, 2));
});


// domainObject.validate(function(err) {
// 	if (err) {
// 		throw err;
// 	} else if (!domainObject._state.isValid) {
// 		// validation failed, res.errors is an array of all errors
// 		// res.fields is a map keyed by field unique id (eg: `address.name`)
// 		// assigned an array of errors per field
// 		return console.dir(domainObject._state.errors);
// 	}

// 	console.log("VALID", domainObject.isValidOrUnchecked());


// 	console.log("VALID", domainObject.isValidOrUnchecked());

// 	if (domainObject.isDirty()) {
// 		domainObject.commit(function(err) {
// 			if (err) {
// 				//validation errors are an error on commit
// 				console.log(domainObject._state.errors);
// 				throw err;
// 			}
// 			//POST: isDirty = false
// 			console.log(JSON.stringify(domainObject, null, 2));
// 		});
// 	}
// 	// console.log(JSON.stringify(domainObject, null, 2));

// 	// console.log(JSON.stringify(domainObject.toDataObject(), null, 2));
// 	// console.log(JSON.stringify(domainObject.toSimple(), null, 2));
// 	// var dto = new DataObject(domainObject);

// 	// console.log("DTO", JSON.stringify(dto, null, 2));
// 	// console.log("ALL FINE");
// 	// STATE: validation passed
// });
