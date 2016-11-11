var _ = require('lodash');
var argv = require("yargs").argv;
var utils = require('./utils');

var agenda = utils.configuredAgenda();

agenda.on('ready', function() {

  if (argv.start || Object.keys(argv).length === 2) {
    console.log("Starting Agenda");
    utils.defineAllJobs(agenda);
    agenda.start();
  }

  if (argv.stop) {
    graceful();
  }

  if (argv.stopJob) {
    agenda.cancel({name: argv.stopJob}, function(err, numRemoved){
      if (err) {
        console.log('ERROR: ', err);
      } else {
        console.log('Cancelled job');
      }
      process.exit(0);
    });
  }

  if (argv.startJob) {
    utils.startJob(agenda, argv.startJob);
  }

  if (argv.reset) {
    console.log('CLEARING ALL DEFINED JOBS');
    agenda.cancel({}, function(err, numRemoved) {
      console.log('Removed ' + numRemoved + ' jobs');
      process.exit(0);
    });
  }

  if (argv.list) {
    agenda.jobs({}, function(err, jobs) {
      console.log(JSON.stringify(jobs, null, 4));
    });
  }
});

function graceful() {
  agenda.stop(function() {
    process.exit(0);
  });
}

process.on('SIGTERM', graceful);
process.on('SIGINT' , graceful);



