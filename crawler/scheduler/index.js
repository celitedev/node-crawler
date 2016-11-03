var _ = require('lodash');
var Agenda = require("agenda");

var config = require("../../config");
var schedule = require('./schedule').schedule;

var agenda = new Agenda(config.agenda);
agenda.defaultConcurrency(1);
agenda.maxConcurrency(1);
agenda.defaultLockLifetime(86400000);

agenda.on('start', function(job){console.log('starting agenda job: ', job.attrs.name)});
agenda.on('complete', function(job){console.log('completed agenda job: ', job.attrs.name)});

agenda.on('error', function(err){
  console.log('Agenda Error: ', err);
});

agenda.on('ready', function() {
  _.each(schedule, function(job){
    console.log('scheduling: ', job.name);
    agenda.define(job.name, require('./jobs/'+job.template));
    agenda.every(job.frequency, job.name, job.data);
  });
  agenda.start();
});



