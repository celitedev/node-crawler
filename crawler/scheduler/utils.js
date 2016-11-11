var _ = require('lodash');
var Agenda = require("agenda");
var config = require("../../config");
var schedule = require('./schedule').schedule;

var configuredAgenda = function(){
  var agenda = new Agenda(config.agenda);
  agenda.defaultConcurrency(1); //one instance of a given job at a time
  agenda.maxConcurrency(2); //max of two jobs running at a time
  agenda.defaultLockLifetime(129600); // 3 days
  return agenda;
};

var defaultListeners = function(agenda){
  agenda.on('start', function(job){console.log('starting agenda job: ', job.attrs.name)});
  agenda.on('complete', function(job){console.log('completed agenda job: ', job.attrs.name)});
  agenda.on('error', function(err){
    console.log('Agenda Error: ', err);
  });
};

var startJob = function(agenda, jobName){
  var job = _.find(schedule, {name: jobName})
  console.log('scheduling: ', job.name);
  defineJob(agenda, job).save();
};

var defineAllJobs = function(agenda){
  _.each(schedule, function(job){
    console.log('scheduling: ', job.name);
    defineJob(agenda, job);
  });
};

function defineJob(agenda, job) {
  agenda.define(job.name, require('./jobs/'+job.template));
  return agenda.every(job.frequency, job.name, job.data);
}

module.exports = {
  configuredAgenda: configuredAgenda,
  defaultListeners: defaultListeners,
  startJob: startJob,
  defineAllJobs: defineAllJobs
};