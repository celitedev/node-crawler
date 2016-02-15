var _ = require("lodash");
var Promise = require("bluebird");
var colors = require("colors");
var t = require("tcomb");


var domainUtils = require("../../schemas/domain/utils");
var domainConfig = require("../../schemas/domain/_definitions/config");

//DomainConfig
var roots = domainConfig.domain.roots;


//Setup CoreNLP
var NLP = require('stanford-corenlp');
var config = {
	"nlpPath": "./corenlp",
	"version": "3.5.2",
	'annotators': [
		"tokenize", //required by pos
		'ssplit', //required by pos
		"pos",
		'parse',
		// 'lemma', //required by ner
		// 'ner',

	],
	// 'annotators': ['tokenize', 'ssplit', 'pos', 'parse', 'sentiment', 'depparse', 'quote'], //optional!
	// 'extra': {
	// 	'depparse.extradependencie': 'MAXIMAL'
	// }
};
var coreNLP = new NLP.StanfordNLP(config);


module.exports = function(command) {

	var app = command.app;
	var config = command.config;
	var generatedSchemas = command.generatedSchemas;
	var r = command.r;
	var esClient = command.esClient;


	var erdEntityTable = r.table(domainUtils.statics.ERDTABLE);

	//FilterQueryUtils
	var filterQueryUtils = require("../utils")(generatedSchemas, r);

	app.post('/ask', function(req, res, next) {

		var question = req.body.question;
		coreNLP.process(question, function(err, result) {
			if (err) return next(err);
			res.json({
				status: 200,
				answer: result
			});
		});

	});

	function createParseTree(tree, arr) {

		// 	recurseParseTree(tree, 0, 0);

		// 	function recurseParseTree(subtree, i, level) {

		// 		var curIndex = i;
		// 		var curLevel = level++;

		// 		var part = _.reduce(subtree.children, function(arr, child) {
		// 			return arr.concat([child.word || ""]).concat(recurseParseTree(child, ++i, level));
		// 		}, []);

		// 		arr.push({
		// 			type: subtree.type,
		// 			part: _.compact(part).join(" "),
		// 			index: curIndex,
		// 			level: curLevel
		// 		});

		// 		return part;
		// 	}
		// }


		recurseParseTree(tree, 0, 0);

		function recurseParseTree(subtree, i, level) {

			var curIndex = i;
			var curLevel = level++;

			var part = _.reduce(subtree.children, function(arr, child) {

				var outObj = recurseParseTree(child, ++i, level);
				i = outObj.i;
				return arr.concat([child.word || ""]).concat(outObj.part);
			}, []);

			arr.push({
				type: subtree.type,
				part: _.compact(part).join(" "),
				index: curIndex,
				level: curLevel
			});

			return {
				part: part,
				i: i
			};
		}
	}


	app.post('/parse', function(req, res, next) {

		var question = req.body.question;
		coreNLP.process(question, function(err, result) {
			if (err) return next(err);

			var arr = [];
			var str = "";
			createParseTree(result.document.sentences.sentence.parsedTree, arr);
			_.each(_.sortByOrder(_.filter(arr, "part"), "index"), function(val) {
				str += Array(val.level * 2).join(" ") + val.type + " => " + val.part + "\r\n";
			});

			res.send(str);
		});

	});


};
