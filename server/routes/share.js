var _ = require("lodash");
var util = require('util');
var Promise = require("bluebird");

var nodemailer = require('nodemailer');
var sparkPostTransport = require('nodemailer-sparkpost-transport');

var transporter = nodemailer.createTransport(sparkPostTransport({
  sparkPostApiKey: "5615c7ff24aacf331dd5cc06e922ee8feadcb9ed", 
  // campaign_id: null,        //Name of the campaign, 
  "metadata": {             //Transmission level metadata containing key/value pairs
    "some_useful_metadata": "testing_sparkpost"
  },           
  options: {              //JSON object in which transmission options are defined
    "open_tracking": true,
    "click_tracking": true,
    "transactional": false 
  },     
}));



module.exports = function (command) {

  var app = command.app;

  // var exampleBody = {
  //   shareType: "email",  //only 'email' is supported for now (later: social, etc.)
  //   type: "card", //card || collection
  //   id: "6ae76003-35f7-54ff-b045-25c3a9593654",
  //   fromName: "Geert-Jan Brits",
  //   to: "a@example.com; b@asdsa.com", //seperate multiple by ';'
  //   msg: "Hey man check out this cool place!. Cheers Geert", //optional
  // };
  app.post('/share', function (req, res, next) {

    if(!req.body.msg){ //from empty string -> undefined
      req.body.msg = undefined;
    }

    req.checkBody('shareType', "required").notEmpty();
    req.checkBody('type', "required").notEmpty();
    req.checkBody('id', "required").notEmpty();
    req.checkBody('fromName', "required").notEmpty();
    req.checkBody('to', "required").notEmpty();
    req.checkBody('itemName', "required").notEmpty();
    req.checkBody('shareType', "should equal 'email'").equals("email");
    req.checkBody('type', "should equal 'card' or 'collection").isContainedInArray(["card", "collection"]);
    req.checkBody('to', "should be ';' seperated list of correct email-addresses").isEmails();

    var errors = req.validationErrors();
    if (errors) {
      res.status(400).json(errors);
      return;
    }

    function createUrl(type, id){
      if(type === "card"){
        return "https://testing123.kwhen.com:7000/details/"  + id;
      }else{ //type === collection
        return "https://testing123.kwhen.com:7000/collections/"  + id; //TODO
      }
    }

    var emailObjs = _.map(req.body.to.split(";"), function(email){
      email = email.trim(); 
      return {
          "address": {
            "email": email,
            // "name": null, //we don't provide this
          }
        };
    });

    Promise.resolve()
    .then(function(){

      // if(req.body.type === "card"){
      //   return Promise.resolve()
      //     .then(function(){
      //       return app.internalRoutes.getEntity(req.body.id);
      //     })
      //     .then(function(card){
      //       return card.raw.name;
      //     });
      // }else{
      //   return Promise.resolve()
      //     .then(function(){
      //       return app.internalRoutes.getEntity(req.body.id);
      //     })
      //     .then(function(card){
      //       return card.raw.name;
      //     });
      // }
    
      return req.body.itemName;
    })
    .then(function(itemName){

      return new Promise(function(resolve, reject){

         //https://github.com/sparkpost/nodemailer-sparkpost-transport#usage
        transporter.sendMail({
          "recipients": emailObjs,
          substitution_data: {
            msg: req.body.msg, //optional
            sender: req.body.fromName, 
            itemUrl: createUrl(req.body.type, req.body.id),
            itemTitle: itemName
          },
          content: { //Choose based on 'type'
            template_id: req.body.type === "card" ? "share-card" : "share-collection"
          }
        }, function(err, info) {
          if (err) {
            return reject(err);
          }

          return resolve(info);
        });
      });
    })
    .catch(function(err){
      res.status(err.status || 500).json({
        err: err
      });
    })
    .then(function(info){
      res.json(info);
    });
    
  });
};
