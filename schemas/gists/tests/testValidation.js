var argv = require('yargs').argv;
var _ = require("lodash");

var CanonicalObject = require("../../domain/DomainObjects").CanonicalObject;

var domainUtils = require("../../domain/utils");

// var obj = {
// 	_type: "LocalBusiness",
// 	name: "Home sweet home",
// 	address: {
// 		// _type: "PostalAddress", //optional since can be inferred
// 		addressLocality: "Tilburg",
// 		postalCode: "5021 GW",
// 		streetAddress: "stuivesantplein 7",
// 		email: "GBRITS@ASDASD.COM"
// 	},
// 	geo: {
// 		// _type: "GeoCoordinates", //optional since can be inferred
// 		latitude: 43.123123,
// 		longitude: 12.123213,
// 		elevation: 1,
// 		// test: 43.123123,
// 	}
// };



// var obj = {
// 	_type: "CreativeWork",
// 	name: "Home asdasdasd",
// 	url: "http://www.google.com",
// 	// genre: [], //["joo", "asdas", "sadas"],
// 	about: "de305d54-75b4-431b-adb2-eb6b9e546014"
// };

var domainObject = new CanonicalObject({
	type: "Review",
	sourceType: "eventful",
	sourceUrl: "url of entity as known at source", //required
	sourceId: "id of entity as known at source" //optional
});


domainObject.set({
	// itemReviewed: "de305d54-75b4-431b-adb2-eb6b9e546014",
	about: "de305d54-75b4-431b-adb2-eb6b9e546014",
	reviewBody: "bla",
	// about: "de305d54-75b4-431b-adb2-eb6b9e546014",
});

domainObject.validate(function(err) {
	if (err) {
		throw err;
	} else if (!domainObject._state.isValid) {
		// validation failed, res.errors is an array of all errors
		// res.fields is a map keyed by field unique id (eg: `address.name`)
		// assigned an array of errors per field
		return console.dir(domainObject._state.errors);
	}

	console.log("VALID", domainObject.isValidOrUnchecked());

	domainObject.set({
		name: "yoMama",
		about: "de305d54-75b4-431b-adb2-eb6b9e546013",
		itemReviewed: "de305d54-75b4-431b-adb2-eb6b9e546013",
	});

	console.log("VALID", domainObject.isValidOrUnchecked());

	if (domainObject.isDirty()) {
		domainObject.commit(function(err) {
			if (err) {
				//validation errors are an error on commit
				console.log(domainObject._state.errors);
				throw err;
			}
			//POST: isDirty = false
			console.log(JSON.stringify(domainObject, null, 2));
		});
	}
	// console.log(JSON.stringify(domainObject, null, 2));

	// console.log(JSON.stringify(domainObject.toDataObject(), null, 2));
	// console.log(JSON.stringify(domainObject.toSimple(), null, 2));
	// var dto = new DataObject(domainObject);

	// console.log("DTO", JSON.stringify(dto, null, 2));
	// console.log("ALL FINE");
	// STATE: validation passed
});
