var _ = require("lodash");

//crawlSchema for: 
//source: Eventful
//type: events
module.exports = {
	_meta: {
		name: "Eventful Events",
		description: "Distributed Crawler for Eventful.com Events"
	},
	entity: {
		type: "Event"
	},
	source: {
		name: "Eventful"
	},
	schema: {
		version: "0.1", //version of this schema
		type: "masterDetail", //signifies overall type of scroll. For now: only 'masterDetail'
		requiresJS: false, //If true, use PhantomJS
		seed: {
			// type of seed. Options:
			// - urlToNextPage: selector to navigate to next page. Needs to include stopCriteria
			// - urlSeed: function to build seed urls to visit. 
			type: "urlToNextPage",
			config: {
				seedUrl: "http://newyorkcity.eventful.com/events/categories",
				nextUrl: function(el) {
					return el.find(".next > a").attr("href");
				},
				//can contain strings (names for templates functions) or custom function. 
				//Function signature: function(el, cb)
				//
				//templated functions: 
				//
				//- urlAlreadyProcessed: looks into db to see if next url already in list of 
				//alreadyProcessed OR queue
				//
				//- zeroResults: processes page and stops if no elements to results to process on this page
				//anymore. This is a good solid check for sites that allows browsing forward indefinitely
				//without displaying results
				//
				//- resultsAlreadyProcessed:  processes page and stops if results found were already processed. 
				//This is a good solud check for sites that display the same set of results after the final page
				//with *real* (unique) results was found.
				stop: "zeroResults"
			}
		},
		check: {

			//how to check entity is new
			//string (templated functions) or custom function
			//Function signature: function(el, cb)
			//
			//options: 
			//- sourceId: check if 'sourceId' exists
			isNew: "sourceId",

			//how to check entity is updated since last processed
			//string (templated functions) or custom function
			//Function signature: function(el, cb)
			//
			//options: 
			//- hash: hash of detail contents
			//- headers: bsaed on cache headers
			isUpdated: "hash",
		},
		results: {
			selector: ".search-results > li", //selector for results
			schema: function(x) { //schema for each individual result
				return {
					sourceUrl: "a.tn-frame@href",
					sourceId: "a.tn-frame@href",
					detail: x("a.tn-frame@href", {
						name: "[itemprop=name] > span",
						startDate: "[itemprop=startDate]@content",
						place: x("[itemprop=location]", {
							name: "[itemprop=name]",
							url: "[itemprop=name] > a@href",
							streetAddress: "[itemprop=streetAddress]",
							addressLocality: "[itemprop=addressLocality]",
							addressRegion: "[itemprop=addressRegion]",
							postalCode: "[itemprop=postalCode]"
						}),
						performers: x("[itemprop=performer]", {
							name: "[itemprop=name]",
							url: "> a@href"
						}),
					})
				};
			}
		}
	}
};
