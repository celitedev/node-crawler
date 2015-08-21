var Xray = require('x-ray');
var x = Xray();

//https: //github.com/dominictarr/JSONStream
var JSONStream = require('JSONStream');
var es = require('event-stream');
var jsf = require('json-stream-formatter');
var _ = require("lodash");
var uuid = require("uuid");

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
var stream = x('https://www.eventbrite.com/d/verenigde-staten--new-york-city/events/', '.l-block-2', [{
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
	.pipe(JSONStream.parse("*"))
	.pipe(es.map(function(eventDTO, cb) {
		if (!eventDTO.id) {
			return cb(); //skip
		}

		if (eventDTO.place) {
			eventDTO.placeId_transient = eventDTO.place.id_transient = uuid.v4();
			var placeDTO = eventDTO.place;
			delete eventDTO.place;
			this.push(placeDTO);
			// this.emit('data', placeDTO);
		}
		// if (eventDTO.organizer) {
		// 	eventDTO.organizer_transient = eventDTO.organizer.id_transient = uuid.v4();
		// 	var organizerDTO = eventDTO.organizer;
		// 	delete eventDTO.organizer;
		// 	this.emit('data', organizerDTO);
		// }

		cb(undefined, eventDTO);
	}))
	.on('error', function(e) {
		console.log(e);
	})
	.pipe(es.stringify())
	.pipe(process.stdout);
