var _ = require("lodash");
var Xray = require('x-ray');
var JSONStream = require('JSONStream');
var h = require("highland");
var uuid = require("uuid");
var argv = require('yargs').argv;
var path = require("path");

var kue = require('kue');

var utils = require("./utils");


/////////
//init //
/////////

if (!argv.source) {
	throw new Error("command-line arg 'source' not defined");
}
if (!argv.type) {
	throw new Error("command-line arg 'type' not defined");
}

var schema = utils.init({
	source: argv.source,
	type: argv.type
});

var crawlConfig = schema.crawlConfig,
	outputMessageSchema = schema.outputMessageSchema;

var queue = kue.createQueue({
	prefix: utils.KUE_PREFIX,
});

var batchid = "1";

utils.addCrawlJob(queue, batchid, crawlConfig, crawlConfig.schema.seed.config.seedUrl, function(err) {
	if (err) {
		throw err;
	}

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
	queue.shutdown(5000, function(err) {
		console.log('Kue shutdown: ', err || '');
		console.log("done seeding (source, type, batchid)", crawlConfig.source.name, crawlConfig.entity.type, batchid);
	});
});
