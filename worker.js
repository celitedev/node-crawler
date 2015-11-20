var _ = require("lodash");
var Xray = require('x-ray');
var JSONStream = require('JSONStream');
var h = require("highland");
var uuid = require("uuid");
var argv = require('yargs').argv;
var path = require("path");

var proxyDriver = require("./drivers/proxyDriver");
var kue = require('kue');

var utils = require("./utils");

var queue = kue.createQueue();

/////////////////////////////////////////////////////////////////////////////////
//TODO                                                                         //
// Seed queue or continue with job                                             //
// i.e.: there should only be 1 seeder process and multiple listening boxes    //
//                                                                             //
// Moreover, we should check:                                                  //
// - master url already done in OR(queue, completed) for *this* batch -> skip  //
// - detail url already done in OR(queue, completed) for *every* batch -> skip //
//                                                                             //
/////////////////////////////////////////////////////////////////////////////////

//Set of master urls done
// //Key: <source, entityType, batch> -> [<url>]
// var setDoneMaster;

// //Set of detail urls done
// //Key: <source, entityType, batch> -> [<url>]
// var setDoneDetail;


////////////////////////
//start stats feedback loop //
////////////////////////
var isDone = false;
(function worker() {
	console.log("nr of detail pages downloaded", downloadedDetailPages);

	//TODO: from config
	//THIS SHOULD BE <SOURCE,TYPE> SPECIFIC!
	var concurrentBatches = 1;

	queue.process(utils.queues.seedQueueName, concurrentBatches, waitUntilWork);

	(function doWork() {
		if (!isDone) {
			setTimeout(doWork, 1000);
		}
	}());

	//producers need to communicate a killpill. This is likely a batchid (monotonically increasing) per
	//<source++type> (and stored in Redis). 
	//Below checker will periodically check if batch was completed from a producers point of view, 
	//i.e: seeding done. 
	//
	//
	//
	// console.log("signal batch is done. E.g.: remove from Kafka");
	// isDone = true;
	// //shutdown redis
	// proxyAndCacheDriver.redisCache.db.quit();
	// setTimeout(process.exit, 1000);


}());

function waitUntilWork(job, done) {

	var data = job.data;

	throw new Error("from job.data to schema");

	/////////
	//init //
	/////////
	var schema = utils.init({
		crawler: argv.crawler,
		isSeeder: true
	});

	var crawlSchema = schema.crawlSchema,
		crawlResultSchema = schema.crawlResultSchema,
		outputschema = schema.outputschema;

	var downloadedDetailPages = 0;

	var x = Xray();

	//install own driver which does: 
	//- proxying through crawlera
	//- caching using S3
	//
	//TODO: cacheable peer <source,type>
	var proxyAndCacheDriver = proxyDriver({
		ctx: {
			headers: crawlSchema.schema.headers
		}
	});
	x.driver(proxyAndCacheDriver);


	/////////////////////
	//Start processing, which involves streaming results
	//
	//LATER: we might improve on this since currenly we only start streaming when batch is done completely
	//which is completely moot. Instead we might want to look into how to process 1 result at a time when done
	/////////////////////
	var rawObjectStream = x(crawlSchema.schema.seed.config.seedUrl, "html", {
			paginate: function distributedPaginate(el, cb) {
				if (crawlSchema.schema.seed.urlToNextPage !== "urlToNextPage") {
					//no pagination
					return cb();
				}
				//upload next url to queue
				console.log("PAGINATE URL STORED IN QUEUE", crawlSchema.schema.seed.config.nextUrl(el));
				//TODO: execute stop criterium
				cb();
			},
			results: x(crawlSchema.schema.results.selector, [crawlResultSchema])
		})
		.write()
		.on('error', function(err) {
			console.log("rawstream ERROR ", err);
		})
		.on('close', function(err) {
			console.log("rawstream CLOSE ", err);
		})
		.pipe(JSONStream.parse('results.*'));


	// ////////////////////
	// //filter a stream //
	// ////////////////////
	var jsonObjectStream = h(rawObjectStream)
		.map(function(obj) {
			return iterTrim(obj);
		})
		.map(function(obj) {
			var detail = obj.detail,
				sourceId = obj.sourceId,
				sourceUrl = obj.sourceUrl;

			delete obj.detail;
			delete obj.sourceId;
			delete obj.sourceUrl;

			return _.extend({
				id: uuid.v4(),
				//TODO: check what attributes should always exist in msg: 
				//- check book
				//- check guigelines for Kafka
				meta: {
					type: crawlSchema.entity.type,
					crawl: {
						crawlJob: 123, //the large job. TODO: based on crawling manager
						taskId: 132903712, //the specific mini job/batch within this crawlJob. TODO: based on crawling manager
						dateTime: new Date().toISOString(),
						crawlSchema: crawlSchema.schema.version, //specific version for this schema, i.e.: Eventful Events v1.0
						msgSchema: outputschema.version, //specific version of the target message schema. 
					},
					source: {
						name: crawlSchema.source.name,
						id: sourceId,
						url: sourceUrl
					}
				},

			}, obj, detail);

		})
		.filter(function(obj) {
			//This is a general filter that removes all ill-selected results, e.g.: headers and footers
			//The fact that a sourceId is required allows is to select based on this. 
			//It's extremely unlikely that ill-selected results have an id (as fetched by the schema) 
			return obj.meta.source.id;
		})
		.map(stringify)
		.on('error', function(err) {
			console.log("jsonObjectStream ERROR ", err);
			//TODO: fail job
		})
		.on('end', function() {
			//Succesfull end of stream. 
			//Batch successfully processed

			//TODO: 
			//- save items to new queue to be processed
			//- add msg to S3 (enrich with DT now() for analytics later o) (NOTE: make sure clocks are in sync)
			//- delete msg from input queue
		})
		.pipe(process.stdout);
}

////////////
//HELPERS //
////////////
function stringify(json) {
	return JSON.stringify(json, null, 4) + '\n';
}

//iteratively walks object and trims all strings
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
