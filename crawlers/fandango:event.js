var _ = require("lodash");
var moment = require("moment");

//crawlSchema for: 
//source: Eventful
//type: events
module.exports = {
	_meta: {
		name: "Fandango Events",
		description: "Distributed Crawler for Fandango.com Events (Movie showtimes)"
	},
	source: {
		name: "fandango"
	},
	entity: {
		type: ["Event", "ScreeningEvent"],
	},
	scheduler: {
		runEveryXSeconds: 24 * 60 * 60 //each day
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

			seedUrls: function() {


				//fetch all 7 days, each and every day
				var dates = [
					moment().add(1, 'days').format('L'),
					// moment().add(2, 'days').format('L'),
					// moment().add(3, 'days').format('L'),
					// moment().add(4, 'days').format('L'),
					// moment().add(5, 'days').format('L'),
					// moment().add(6, 'days').format('L'),
					// moment().add(7, 'days').format('L')
				];

				var districts = [
					"http://www.fandango.com/manhattan_+ny_movietimes?pn=1",
					"http://www.fandango.com/brooklyn_+ny_movietimes?pn=1",
					"http://www.fandango.com/queens_+ny_movietimes?pn=1",
					"http://www.fandango.com/bronx_+ny_movietimes?pn=1",
					"http://www.fandango.com/staten+island_+ny_movietimes?pn=1"
				];

				var urls = _.reduce(districts, function(agg, url) {
					_.each(dates, function(date) {
						agg.push(url + "&date=" + date);
					});
					return agg;
				}, []);

				return urls;
			},

			nextUrlFN: function(el) {
				return el.find("#GlobalBody_paginationControl_NextLink").attr("href");
			}
		},
		results: {
			selector: ".showtimes-theater", //selector for results

			schema: function(x) { //schema for each individual result

				return {

					//movietheater
					placeRefs: x(".showtimes-theater-title", [{
						id: "@href",
						url: "@href",
						name: "@text"
					}]),

					//multiple movies per movietheater
					movieContainer: x(".showtimes-movie-container", [{

						movieShowingContainer: x(".showtimes-times > a", [{
							sourceId: "time@datetime",
							sourceUrl: "@href",
							name: "time@datetime",
							//descriptionShort: nope
							// description: nope
							dtstart: "time@datetime",
							//dtend: nope
							//duration: nope
							//rdate: nope
							//rrule: nope
						}]),

						//moie
						objectRefs: x(".showtimes-movie-title", [{
							id: "@href",
							url: "@href",
							name: "@text"
						}])
					}]),

					//performerRefs: nope
				};
			},

			//Reducer is called after all fieldMappings are called, 
			//and just before postsMappings are called. 
			//
			//You can use this to do a complete custom mapping. 
			//Also going from 1 to several items is supported. This therefore implements #31.
			reducer: function(doc) {

				var showings = [];

				_.each(doc.movieContainer, function(movieContainer) {
					_.each(movieContainer.movieShowingContainer, function(movieShowingContainer) {

						//Create compound name/id
						//
						//TODO: we should probably adhere to some schema for constructing things such as 'movieshowing names' 
						//in a uniform wau. 
						//
						var time = movieShowingContainer.name,
							placeName = doc.placeRefs[0].name,
							movieName = movieContainer.objectRefs[0].name;

						var id = (placeName + " -- " + movieName + " -- " + time);
						name = id;

						// if(movieShowingContainer.sourceUrl.lastIndexOf("#")

						showings.push(_.extend(movieShowingContainer, {
							sourceId: id, //should have an id. Otherwise it's auto-pruned
							name: name,
							idCompound: true,
							objectRefs: movieContainer.objectRefs,
							placeRefs: doc.placeRefs
						}));
					});
				});

				return showings;
			},

			postMapping: {
				"sourceUrl": function(sourceUrl) {
					//only keep urls if they actually point somewhere
					if (sourceUrl.lastIndexOf("#") === sourceUrl.length - 1) {
						return undefined;
					}
					return sourceUrl;
				},
			},
		}
	}
};
