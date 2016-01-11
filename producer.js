var _ = require("lodash");
var Xray = require('x-ray');
var JSONStream = require('JSONStream');
var h = require("highland");
var uuid = require("uuid");
var argv = require('yargs').argv;
var path = require("path");

var kue = require('kue');
var Promise = require("bluebird");
var utils = require("./utils");

var config = require("./config");


/////////
//init //
/////////

if (!argv.source) {
	throw new Error("command-line arg 'source' not defined");
}
if (!argv.type) {
	throw new Error("command-line arg 'type' not defined");
}

var crawlConfig = utils.fetchCrawlConfig({
	source: argv.source,
	type: argv.type
});

var queue = kue.createQueue({
	prefix: utils.KUE_PREFIX,
	redis: config.redis
});

var batchid = "1";


//create urls that need to be seeded
var urlsOrFN = crawlConfig.schema.seed.seedUrls,
	urls = _.isFunction(urlsOrFN) ? urlsOrFN() : urlsOrFN;

urls = _.isArray(urls) ? urls : [urls];


//TODO:
//Running will ALWAYS run with increased batchId. 
//
//However, there's a check that if currentBatchId was added less than x time ago it will shortcircuit by default. 
//forceNewBatch=true overwrites this failsafe.
//
//A default safe solution is important, because depending on config this may mean that 
//in-process + queued jobs of current batchId are discarded. 
//
//deleteOldJobs=true | false(default) can be added to remove old jobs from the queue. I.e.: of batchid < newly created batchId
//
var promises = _.map(urls, function(url) {
	return new Promise(function(resolve, reject) {
		utils.addCrawlJob(queue, batchid, crawlConfig, url, function(err) {
			if (err) {
				return reject(err);
			}
			resolve();
		});
	});
});

Promise.all(promises)
	.finally(function() {
		queue.shutdown(5000, function(err) {
			console.log('Kue shutdown: ', err || '');
			console.log("done seeding (source, type, batchid)", crawlConfig.source.name, crawlConfig.entity.type, batchid);
		});
	});
