var _ = require("lodash");

//crawlSchema for: 
//source: Eventful
//type: events
module.exports = {
	_meta: {
		name: "Eventful Plaves",
		description: "Distributed Crawler for Eventful.com Places"
	},
	source: {
		name: "Eventful"
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
		concurrentJobs: 10,
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
		proxy: "socks://localhost:5566",

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
			disable: false, //for testing. Disabled nextUrl() call

			//may be a string an array or string or a function producing any of those
			// seedUrls: function() {
			// 	var urls = [];
			// 	for (var i = 1; i < 20; i++) {
			// 		urls.push("http://newyorkcity.eventful.com/venues?page_number=" + i);
			// 	}
			// 	return urls;
			// },
			seedUrls: "http://newyorkcity.eventful.com/venues?page_number=1",

			nextUrlFN: function(el) {
				return el.find(".next > a").attr("href");
			},


			// STOP CRITERIA when processing nextUrlFN
			// When processing one page after another using nextUrlFN, we need a way to check if we're done.
			// A couple of standard checks are always performed to this end: 
			//
			// - check if nextUrl is the same as currentUrl. This is often employed by sites and is 
			//  used as a sure sign we're done
			// - nextUrl is not an url (i.e if nexturl() finds a 'href' that isn't there anymore)
			//
			// Besides that a crawler may implement specific stop criteria based on domain knowledge:
			// - Templated functions (referenced by string or object with attrib name = name of template function)
			// - custom function. Signature : function(el, cb) TO BE IMPLEMENTED
			//
			// Available Templated functions: 
			// - zeroResults: uses `results.selector` + optional `selectorPostFilter` to check for 0 results. 
			//
			// Below is a working example. 
			// It's superfloous for this crawler through, since general checks desribed above are enough.
			stop: [{
				name: "zeroResults", //zeroResults
				selectorPostFilter: function(result) {
					//as described above this is s
					return result.attribs.itemscope !== undefined;
				}
			}]
		},
		headers: { //Default Headers for all requests
			"Accept-Encoding": 'gzip, deflate'
		},
		results: {
			//WEIRD: selector: ".search-results > li[itemscope]" produces 9 instead of 10 results
			//We use the more wide selector and are able to correcty do a generic post filter on 'id' exists.
			selector: ".search-results > li", //selector for results

			schema: function(x) { //schema for each individual result
				return {
					sourceUrl: "a.tn-frame@href",
					sourceId: "a.tn-frame@href",
					detail: x("a.tn-frame@href", {
						name: "[itemprop=name] > span",
						// descriptionShort
						description: ".section-block.description",
						latitude: "[itemprop=latitude]@content",
						longitude: "[itemprop=longitude]@content",
						streetAddress: "[itemprop=streetAddress]",
						// streetAddressSup: 
						zipCode: "[itemprop=postalCode]",
						neighborhood: ".neighborhood > span",
						city: "[itemprop=addressLocality]",
						region: "[itemprop=addressRegion]",
						// country: 
						images: x(".image-viewer li", [{
							url: "a@href",
							alt: "@title",
							// cc
						}]),
					})
				};
			},

			//transformers allow function(entire obj) || strings or array of those
			//returning undefined removes them
			transformers: {
				"detail.latitude": "float",
				"detail.longitude": "float"
			},
		}
	}
};