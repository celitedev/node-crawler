var Promise = require('bluebird');
var _ = require("lodash");
require("colors");
var env = process.env.NODE_ENV || "dev";

var config = {
  dev: {
    redis: {
      host: "localhost",
      port: 6379
    },

    proxy: {
      host: "localhost",
      port: 5566
    },

    //https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/configuration.html
    elasticsearch: {
      host: 'http://127.0.0.1:9201',
      apiVersion: "2.2"
      //host: 'http://ec2-52-91-153-20.compute-1.amazonaws.com:9200',
      // log: 'trace',
      //apiVersion: "2.1",
      // maxSockets: 10, //default
      // defer: function() { //overwrite how ES makes promises
      //  return Promise.defer();
      // }
    },

    rethinkdb: {
      pool: true, //default = true
      //true is interesting:  When true, the driver will regularly pull data from the table server_status
      //to keep a list of updated hosts, default false
      //TBD: check if useul to put to true.
      discovery: false,
      db: "kwhen", //default databse if non is mentioned
      servers: [{
        host: 'localhost',
        port: 28015
      }],
      buffer: 50,
      max: 1000
    },

    search_query_parser: {
      host: "localhost",
      port: 9000
    }
  },
  staging: {
    redis: {
      host: "localhost",
      port: 6379
    },

    proxy: {
      host: "ec2-52-45-105-133.compute-1.amazonaws.com",
      port: 5566
    },

    //https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/configuration.html
    elasticsearch: {
      host: 'http://127.0.0.1:9200',
      apiVersion: "2.2"
      //host: 'http://ec2-52-91-153-20.compute-1.amazonaws.com:9200',
      // log: 'trace',
      //apiVersion: "2.1",
      // maxSockets: 10, //default
      // defer: function() { //overwrite how ES makes promises
      //  return Promise.defer();
      // }
    },

    rethinkdb: {
      pool: true, //default = true
      //true is interesting:  When true, the driver will regularly pull data from the table server_status
      //to keep a list of updated hosts, default false
      //TBD: check if useul to put to true.
      discovery: false,
      db: "kwhen", //default databse if non is mentioned
      servers: [{
        host: 'localhost',
        port: 28015
      }],
      buffer: 50,
      max: 1000
    },

    search_query_parser: {
      host: "localhost",
      port: 9000
    }
  },
  staging_remote: {
    redis: {
      host: "localhost",
      port: 6379
    },

    proxy: {
      host: "ec2-52-45-105-133.compute-1.amazonaws.com",
      port: 5566
    },

    //https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/configuration.html
    elasticsearch: {
      host: 'http://ec2-23-22-187-201.compute-1.amazonaws.com:9200',
      // log: 'trace',
      apiVersion: "2.2",
      // maxSockets: 10, //default
      // defer: function() { //overwrite how ES makes promises
      //  return Promise.defer();
      // }
    },

    rethinkdb: {
      pool: true, //default = true
      //true is interesting:  When true, the driver will regularly pull data from the table server_status
      //to keep a list of updated hosts, default false
      //TBD: check if useul to put to true.
      discovery: false,
      db: "kwhen", //default database if none is mentioned
      servers: [{
        host: 'ec2-23-22-187-201.compute-1.amazonaws.com',
        port: 28015
      }],
      buffer: 50,
      max: 1000
    }
  },
  prod_remote: {
    redis: {
      host: "localhost",
      port: 6379
    },

    proxy: {
      host: "ec2-52-45-105-133.compute-1.amazonaws.com",
      port: 5566
    },

    //https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/configuration.html
    elasticsearch: {
      host: 'http://ec2-52-44-221-158.compute-1.amazonaws.com:9200',
      // log: 'trace',
      apiVersion: "2.1",
      // maxSockets: 10, //default
      // defer: function() { //overwrite how ES makes promises
      //  return Promise.defer();
      // }
    },

    rethinkdb: {
      pool: true, //default = true
      //true is interesting:  When true, the driver will regularly pull data from the table server_status
      //to keep a list of updated hosts, default false
      //TBD: check if useul to put to true.
      discovery: false,
      db: "kwhen", //default database if none is mentioned
      servers: [{
        host: 'ec2-52-2-8-128.compute-1.amazonaws.com',
        port: 28015
      }],
      buffer: 50,
      max: 1000
    }
  },
  prod: {
    redis: {
      host: "ec2-50-16-27-104.compute-1.amazonaws.com",
      port: 6379
    },

    proxy: {
      host: "ec2-52-45-105-133.compute-1.amazonaws.com",
      port: 5566
    },

    //https://www.elastic.co/guide/en/elasticsearch/client/javascript-api/current/configuration.html
    elasticsearch: {
      host: 'http://ec2-52-44-221-158.compute-1.amazonaws.com:9200',
      // log: 'trace',
      apiVersion: "2.1",
      // maxSockets: 10, //default
      // defer: function() { //overwrite how ES makes promises
      //  return Promise.defer();
      // }
    },

    rethinkdb: {
      pool: true, //default = true
      //true is interesting:  When true, the driver will regularly pull data from the table server_status
      //to keep a list of updated hosts, default false
      //TBD: check if useul to put to true.
      discovery: false,
      db: "kwhen", //default databse if non is mentioned
      servers: [{
        host: 'ec2-52-2-8-128.compute-1.amazonaws.com',
        port: 28015
      }],
      buffer: 50,
      max: 1000
    }
  }
};

if(!config[env]){
  console.log(("config not found for environment=").red + (env).green + " Available options: " + (_.keys(config).join(",")).yellow);
  throw new Error("Config error");
}

console.log(("Starting with config: ") + ("'" + env + "'-mode").yellow);

module.exports = config[env];
