var Xray = require('x-ray');
var x = Xray();

var JSONStream = require('JSONStream');
var h = require("highland");
var _ = require("lodash");
var uuid = require("uuid");

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


//TODO
//1. look into redis streams. Useful? 
var rawObjectStream = x('https://www.eventbrite.com/d/verenigde-staten--new-york-city/events/?view=list', '.l-block-2', [{
		id: "a@data-eid",
		schemaType: '@additionaltype',
		url: 'a@href',
		img: '.js-poster-image@src',
		label: '.list-card__label',
		priceCurrency: '[itemprop=priceCurrency]@content',
		lowPrice: '[itemprop=lowPrice]@content',
		highPrice: '[itemprop=highPrice]@content',
		startDT: "[itemprop=startDate]@content",
		name: ".list-card__title",
		organizer: x('[itemprop=organizer]', {
			name: '[itemprop=name]@content',
			url: '[itemprop=name]@url',
		}),
		place: x('[itemprop=location]', {
			name: '[itemprop=name]@content',
			latitude: '[itemprop=latitude]@content',
			longitude: '[itemprop=longitude]@content',
			address: x('[itemprop=address]', {
				name: '[itemprop=name]@content',
				country: '[itemprop=addressCountry]@content',
				locality: '[itemprop=addressLocality]@content',
				streetAddress: '[itemprop=streetAddress]@content',
				postalCode: '[itemprop=postalCode]@content'
			})
		}),
	}])
	// .paginate('.next_page@href')
	// .limit(3)
	.write()
	.pipe(JSONStream.parse('*'));


var totalStream = h(rawObjectStream)
	.filter(function(data) {
		return data.id; //if data.id exists pass through
	})
	.map(function(obj) {
		obj = iterTrim(obj);
		if (obj.place) {
			obj.placeId_transient = obj.place.id_transient = uuid.v4();
		}
		if (obj.organizer) {
			obj.organizer_transient = obj.organizer.id_transient = uuid.v4();
		}
		return obj;
	});

// fork of the stream

// .. in a stream containing events.. 
var eventStream = totalStream.fork()
	.map(function(obj) {
		var eventDTO = _.clone(obj);
		delete eventDTO.place;
		delete eventDTO.organizer;
		return eventDTO;
	});


// .. and a stream containing places
var placeStream = totalStream.observe().fork()
	.filter(function(obj) {
		return obj.place;
	})
	.map(function(obj) {
		return _.clone(obj.place);
	});


// .. afterwards combine them and print them to stdout
h([eventStream, placeStream])
	.merge()
	.map(stringify)
	.pipe(process.stdout);
