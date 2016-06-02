var Xray = require('x-ray');


var JSONStream = require('JSONStream');
var h = require("highland");
var _ = require("lodash");
var uuid = require("uuid");

var phantom = require('x-ray-phantom');


var x = Xray(); //.driver(phantom());

var xDetailPage = Xray(); //.throttle(1, '4s'); //1 detail page every 4 secs

////////////
//HELPERS //
////////////
function stringify(json) {
	return JSON.stringify(json, null, 4) + '\n';
}

function iterTrim(obj, key) {
	if (_.isDate(obj)) {
		return obj;
	} else if (_.isArray(obj)) {
		return _.map(obj, iterTrim);
	} else if (_.isObject(obj)) {
		return _.reduce(obj, function(agg, prop, key) {
			agg[key] = iterTrim(prop, key);
			return agg;
		}, {});
	} else if (_.isString(obj)) {
		obj = _.trim(obj);
		return obj;
	} else {
		return obj;
	}
}

// x('http://google.com', {
// 	main: 'title',
// 	image: x('#gbar a@href', 'title'), // follow link to google images
// })(function(err, obj) {
// 	console.log(err, obj);
// });


//TODO
//1. look into redis streams. Useful? 
var downloadedDetailPages = 0;

var isDone = false;
(function signalProcess() {
	console.log("nr of detail pages downloaded", downloadedDetailPages);
	if (!isDone) {
		setTimeout(signalProcess, 1000);
	}
}());

var rawObjectStream = x('http://newyorkcity.eventful.com/venues', '#venues-list > li', [{
		id: ".main-favorites@data-id",
		href: "a.tn-frame@href",
		detail: xDetailPage("a.tn-frame@href", {
			name: "[itemprop=name] > span",
			streetAddress: "[itemprop=streetAddress]",
			addressLocality: "[itemprop=addressLocality]",
			addressRegion: "[itemprop=addressRegion]",
			postalCode: "[itemprop=postalCode]",
			images: [".image-viewer a@href"],
			geo: x("[itemprop=geo]", {
				latitude: "[itemprop=latitude]@content",
				longitude: "[itemprop=longitude]@content",
			}),
			calcPageDone: function(el, cb) {
				downloadedDetailPages++;
				cb();
			}
		})
	}])
	.paginate('.next > a@href')
	.limit(1)
	.write()
	.on('error', function(err) {
		console.log("rawstream ERROR ", err);
	})
	.pipe(JSONStream.parse('*'));


////////////////////
//filter a stream //
////////////////////
var jsonObjectStream = h(rawObjectStream)
	.filter(function(obj) {
		return obj.id;
	})
	.map(function(obj) {
		obj = iterTrim(obj);
		// if (obj.place) {
		// 	obj.placeId_transient = obj.place.id_transient = uuid.v4();
		// }
		// if (obj.organizer) {
		// 	obj.organizer_transient = obj.organizer.id_transient = uuid.v4();
		// }
		return obj;
	})
	.map(stringify)
	.on('error', function(err) {
		console.log("jsonObjectStream ERROR ", err);
	})
	.on('end', function() {
		//succesfull end of stream. 
		//Everything read and processed. 
		console.log("signal batch is done. E.g.: remove from Kafka");
		isDone = true;
	})
	.pipe(process.stdout);
