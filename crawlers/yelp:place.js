var _ = require("lodash");
var URL = require("url");

//crawlSchema for: 
//source: Eventful
//type: events
module.exports = {
	_meta: {
		name: "Yelp Places",
		description: "Distributed Crawler for Yelp.com Places"
	},
	source: {
		name: "Yelp"
	},
	entity: {
		type: "Place",
		schema: "source_place", //the actual schema to use
	},
	//General logic/behavior for this crawler 
	semantics: {

		//prune LIST URL if already processed 
		//options: 
		//- false: never prune
		//- true: prune if url already processed
		//- batch: prune if url already processed for this batch
		pruneList: "batch",

		//prune ENTITY URL if already processed 
		//options: 
		//- false: never prune
		//- true: prune if url already processed
		//- batch: prune if url already processed for this batch
		pruneEntity: true,

		//How to check entity is updated since last processed
		// - string (templated functions) 
		// - custom function. Signature: function(el, cb)
		//
		//template options: 
		//- hash: hash of detail contents
		//- headers: based on cache headers
		dirtyCheckEntity: "hash",


		//Examples: 
		//
		//pruneList = batch + pruntEntity = true -> 
		//Each batch run prunes lists pages when done within the same batch. 
		//However, the next batch run lists aren't pruned to stay up-to-date with changed contents (new entities?)
		//of these list pages. 
		//Regardless, due to pruneEntity=true, the crawler will not recheck entities if they're already processed. 
		//This is the default (and fastest) mode, based on the rationale that entities do not change often if at all. 
		//I.e.: a Place-page on Eventful will rarely update it's contents. 
		//
		//Prunelist = batch + pruneEntity = batch -> 
		//recheck already processed entities for each new batch.
		//
		//A good setting may be: 
		//- EACH HOUR: Run pruneList = batch + pruntEntity = true 
		//- EACH DAY: Run pruneList = batch + pruntEntity = batch 
	},
	job: {
		//x concurrent kue jobs
		//
		//NOTE: depending on the type of crawl this can be a master page, which 
		//within that job will set off concurrent detail-page fetches. 
		//In that case total concurrency is higher than specified here. 
		//
		//#6: distribute concurrency per <source,type> or <source>
		//for more controlled throttling.
		concurrentJobs: 1,
		retries: 5,

		// fail job if not complete in 100 seconds. This is used because a consumer/box can fail/crash
		// In that case the job would get stuck indefinitely in 'active' state. 
		// With this solution, the job is placed back on the queue, and retried according to 'retries'-policy
		ttl: 100 * 1000,
	},
	driver: {

		//timeout on individual request. 
		//Result: fail job and put back in queue as oer config.job.retries
		timeoutMS: 40000,

		//local proxy, e.g.: TOR
		// proxy: "socks://localhost:5566",

		//Default Headers for all requests
		headers: {
			"Accept-Encoding": 'gzip, deflate'
		}
	},
	schema: {
		version: "0.1", //version of this schema
		type: "masterDetail", //signifies overall type of scroll. For now: only 'masterDetail'
		requiresJS: false, //If true, use PhantomJS
		seed: {
			disable: true, //for testing. Disabled nextUrl() call

			//may be a string an array or string or a function producing any of those
			// seedUrls: function() {
			// 	var urls = [];
			// 	for (var i = 1; i < 20; i++) {
			// 		urls.push("http://newyorkcity.eventful.com/venues?page_number=" + i);
			// 	}
			// 	return urls;
			// },
			seedUrls: "http://www.yelp.com/search?find_loc=New+York,+NY,+USA&cflt=restaurants&start=0",

			nextUrlFN: function(el) {
				return el.find(".prev-next.next").attr("href");
			},
		},
		headers: { //Default Headers for all requests
			"Accept-Encoding": 'gzip, deflate'
		},
		results: {
			selector: ".search-results > li.regular-search-result", //selector for results

			schema: function(x) { //schema for each individual result
				return {
					sourceUrl: ".biz-name@href",
					sourceId: ".biz-name@href",
					detail: x(".biz-name@href", {
						name: ".biz-page-title",
						// descriptionShort  //TODO
						// description: ".section-block.description", //TODO
						// latitude: "[itemprop=latitude]@content", //requires #30 
						// longitude: "[itemprop=longitude]@content",//requires #30 
						streetAddress: "[itemprop=streetAddress]",
						// streetAddressSup: nope
						zipCode: "[itemprop=postalCode]",
						neighborhood: ".neighborhood-str-list",
						crossStreets: ".cross-streets",
						city: "[itemprop=addressLocality]",
						region: "[itemprop=addressRegion]",
						// country: nope
						tel: "[itemprop=telephone]",
						//fax: nope
						//email: nope
						website: ".biz-website > a@href",

						//TODO: on different page so do nested crawl
						// images: x(".image-viewer li", [{
						// 	url: "a@href",
						// 	alt: "@title",
						// 	// cc
						// }]),

						//TODO: MODEL IN 'SOURCE_PLACE'
						//openinghours
						//pricerange
						//category (restaurant) (hmm. Yelp does multi-label classification?)
						//tags (category specific)
						//reviews_nr
						//reviews_avg
						//more factual (generic + category specific). E.g.: wifi, delivery, etc. 
						//directions, incl public transport. How does Yelp do this?

					})
				};
			},

			//transformers allow function(entire obj) || strings or array of those
			//returning undefined removes them
			transformers: {
				"detail.website": function(obj) {
					var url = obj.detail.website;
					if (!url) {
						return undefined;
					}
					var absUrl = "http://yelp.com" + url;
					var urlObj = URL.parse(absUrl, true);
					return urlObj.query.url;
				},
			},
		}
	}
};
