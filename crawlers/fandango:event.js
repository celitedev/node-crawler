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


				//fetch all 7 days, each and every time crawler is run
				var dates = [
					moment().format('L'),
					moment().add(1, 'days').format('L'),
					moment().add(2, 'days').format('L'),
					moment().add(3, 'days').format('L'),
					moment().add(4, 'days').format('L'),
					moment().add(5, 'days').format('L'),
					moment().add(6, 'days').format('L'),
					moment().add(7, 'days').format('L')
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

			detailPageAware: false,

			schema: function(x) { //schema for each individual result

				return {

					locationName: ".showtimes-theater-title",

					//movietheater
					location: ".showtimes-theater-title@href", //automatic expansion to _ref

					//multiple movies per movietheater
					movie: x(".showtimes-movie-container", [{

						screeningEvent: x(".showtimes-times > a", [{
							_sourceUrl: "@href",
							startDate: "time@datetime",
						}]),

						movieName: ".showtimes-movie-title",

						//movie
						workPresented: ".showtimes-movie-title@href", //automatic expansion to _ref

					}]),
				};
			},

			//Reducer is called after all fieldMappings are called, 
			//and just before postsMappings are called. 
			//
			//You can use this to do a complete custom mapping. 
			//Also going from 1 to several items is supported. This therefore implements #31.
			reducer: function(doc) {

				var showings = [];

				_.each(doc.movie, function(movie) {
					_.each(movie.screeningEvent, function(screeningEvent) {

						//Id is required so make it up. 
						//NOTE: we can't use _sourceId = _sourceUrl, since _sourceUrl doesn't
						//always exist.
						var time = screeningEvent.startDate,
							locationName = doc.locationName,
							movieName = movie.movieName;

						var id = (locationName + " -- " + movieName + " -- " + time);

						showings.push({
							_sourceUrl: screeningEvent._sourceUrl, //doesn't always exist
							_sourceId: id,
							name: id,
							startDate: screeningEvent.startDate,
							workPresented: movie.workPresented,
							location: doc.location
						});
					});
				});

				return showings;
			},

			postMapping: {
				"_sourceUrl": function(sourceUrl) {
					//only keep urls if they actually point somewhere
					//I.e.: outdated events don't have real urls
					if (sourceUrl.lastIndexOf("#") === sourceUrl.length - 1) {
						return undefined;
					}
					return sourceUrl;
				},
			},
		}
	}
};
