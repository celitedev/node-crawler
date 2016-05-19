var _ = require("lodash");
var Promise = require("bluebird");

var chunkUtils = require("./utils");

module.exports = function (command) {

  var NLPRules = require("./rules")(command);

  var roots = command.roots;
  var cacheUtils = command.cacheUtils;

  var NOUN_TYPE = {
    PROPER: "PROPER",
    PLURAL: "PLURAL",
    SINGULAR: "SINGLUAR"
  };

  var rootsToProperCase = _.reduce(roots, function (agg, root) {
    agg[root.toLowerCase()] = root;
    return agg;
  }, {});


  function fetchRootProperCased(rootNameLower) {
    return rootsToProperCase[rootNameLower];
  }

  function createQueryPlan(question) {

    var nounSignals = {

      //if true, we're likely looking at improper defined NP
      //skip for now
      noNounFound: false,

      //if true, likely compound or improper defined NP
      //skip for now
      multipleNounsFound: false,

      //if true, NP consists of multiple parts
      isComplexNoun: false,

      //if true, weak signal for non-proper noun
      nounExistsAtEnd: false,

      //set to the matched subtype if found
      subtypeMatched: false,

      //if true, noun is the plural of the subtype found
      subtypePlural: false,

      //if subtype found, defines a collection of roots that can contain this subtype.
      subtypeRoots: null,

    };

    function processPlural(command) {

      return Promise.resolve()
        .then(function () {

          var root = fetchRootProperCased(command.nounSignals.subtypeRoots[0]);
          var supportedTags = cacheUtils.supportedAttribsPerRoot[root.toLowerCase()].tags;

          var filterContext = {
            filter: {},
            type: root,
            wantUnique: false, //plural
          };

          var subtype = command.nounSignals.subtypeMatched;

          //add subtype filter if matched subtype isn't root
          if (subtype !== root.toLowerCase()) {
            filterContext.filter.subtypes = subtype;
          }

          //build list of adverbs and adjectives
          //add those as term-filters to 'tagsFromFact'
          if (command.nounSignals.isComplexNoun) {

            var foundTags = _.pluck(chunkUtils.filter(command.nounSignals.np.parts, {
              tag: "(JJ*?|RB*?)"
            }), "word");

            var foundSupportedTags = _.intersection(foundTags, supportedTags);
            filterContext.filter.tagsFromFact = foundSupportedTags;

            //DEBUG: unsupported filters
            command.sentenceSignals.filtersUnmatched = _.difference(foundTags, supportedTags);

          }

          //DEBUG: supported filters
          command.sentenceSignals.filters = filterContext.filter;

          filterContext.nlpMeta = command;

          return filterContext;
        });
    }

    function processSingular(command) {
      command.doFallback = true;
      return command;
    }

    function processProper(command) {
      command.doFallback = true;
      return command;
    }

    function processFallback(command) {
      command.doFallback = true;
      return command;
    }


    var sentenceSignals = {
      nounType: null,
      temporal: null, //specific, undefined (default now), past, present, future
      spatial: null, //noun-place-indication, specific lat/long, address/corner/between, user-location
      filters: {}, //based on JJ(.)? + RB(.)?
      sort: null, //specific: JJ(good) / JJS(better) / JJS(best), (also RBR, RBS)  default based on (type, location to user, other context?)
    };

    var err;

    return Promise.resolve()
      .then(function () {

        var tags = NLPRules.getTags(question);
        var sChunk = NLPRules.getChunks(tags);

        var currentChunk = {
          type: "top"
        };

        var chunks = chunkUtils.getParts(currentChunk, sChunk);

        ///////////////////////////////////////////////////////////////
        //NOTE: THERE'S A PATTERN IN HOW EXPLICIT AND IMPLICIT DIFFER
        /////////////////////////////////////////////////////////////////

        var commandObj = {
          sentenceSignals: sentenceSignals,
          nounSignals: nounSignals,
          questionType: "UNKNOWN",
          tags: tags,
          chunks: sChunk,
          tree: chunks,
        };

        if (chunks.abstractText.match(/^chunk:QUESTION chunk:NP( chunk:VP)+( chunk:PP)*$/)) {
          //which restaurants are open tonight
          //which restaurants will be open tonight
          //which artist plays tonight in madison square garden
          //which jazz bands play tonight at my favorite club
          //which fine italian restaurants allow for reservations tomorrow night near grand central station
          //which events does arctic monkeys perform tonight at my favorite club 
          //which events does arctic monkeys perform tonight that are still available
          //which restaurants are fine to go to tonight
          commandObj.questionType = "Q_ACTIVE_EXPLICIT";

          //- find NP
          //- decide on proper noun or not  (probably using couple of signals + confidence score in the end)
          //- plural / singular
          var np = chunkUtils.find(chunks.parts, {
            chunkType: "NP"
          });

          //analyze noun structure. This gives signals on how to interpret noun. 
          nounSignals.np = np;
          findNPSignals(nounSignals, np, getAllSubtypesMap());

          //For now...
          if (nounSignals.noNounFound) {
            err = new Error("no noun found");
            err.details = nounSignals;
            throw err;
          }

          //For now...
          if (nounSignals.multipleNounsFound) {
            err = new Error("multiple nouns found");
            err.details = nounSignals;
            throw err;
          }

          nounSignals.isProperNoun = "UNCLEAR";


          if (nounSignals.subtypeMatched && nounSignals.subtypePlural) {
            //Very likely that we're talking a non-proper noun. 
            //
            //This among other things because it's very unlikely that a proper noun 
            //contains a plural form of a subtype. 
            //
            //e.g.: fine italian restaurants

            nounSignals.isProperNoun = false;

          } else {

            //TODO: more signals to determine proper noun or not. This includes:
            // - lookup of name
            // - ...
            // TODO: if confidence is low, we note this so that if we end up 
            // doing fetch for isProper = false, we might want to give out a warning or something. 
            // "we think you mean..." 
          }


          //Decision time on Proper Noun!
          if (nounSignals.isProperNoun === false) {

            //confident that noun is NOT a proper noun

            //Decide on singular or plural code-path. 
            //Results can be totally different so we separate these cases out explicitly.
            //
            //SINGULAR, e.g.: 
            // - which artist,... etc
            // - might also have structure of plural, in which case we should treat as plural, and singular
            //     might have been input error.
            //
            //PLURAL, e.g.: 
            // - which restaurants
            // - which artists


            //For now decide singular/plural by this simple check
            //TODO: Stronger checks / more indicators.
            // - Look at top verb (skip MD) or verb inside first VP -> ar vs. is, etc. 
            sentenceSignals.nounType = nounSignals.subtypePlural ? NOUN_TYPE.PLURAL : NOUN_TYPE.SINGULAR;

          } else if (nounSignals.isProperNoun === true) {
            //confident that noun IS proper noun 
            //because we just found it

            sentenceSignals.nounType = NOUN_TYPE.PROPER;

          } else {

            //TODO: we should always choose one or the other. 
            //However, we might indicate a low confidence. See description above
            sentenceSignals.nounUndecided = true;
          }

          //STEP 2
          //decide on sentence form, starting with 'who, which, when, where', etc. 
          //decide on missing context / defaulting. I.e.: for Q_ACTIVE_IMPLICIT | Q_PASSIVE_EXPLICIT
          //add defaults as PP

          //STEP 3
          //use VP and PP as filters

          //STEP 4. 
          //voila a filterContext.


        } else if (chunks.abstractText.match(/^chunk:QUESTION chunk:NP( chunk:VP)*( tag:(VB.*?|MD))* (tag:VB.*?)$/)) {

          //which restaurants are|will open
          //which artist will play
          //which events does arctic monkeys perform
          commandObj.questionType = "Q_ACTIVE_IMPLICIT";

        } else if (chunks.abstractText.match(/^(chunk:QUESTION chunk:VP chunk:VP)( chunk:PP)*$/)) {

          //when does|will the crazy goose open tonight in bla
          //do the avengers play tomorrow in the AMC at 6 pm

          //when do the arctic monkeys perform tonight
          commandObj.questionType = "Q_PASSIVE_EXPLICIT";

        } else if (chunks.abstractText.match(/^(chunk:QUESTION chunk:VP( tag:(VB.*?|MD))* tag:VB.*?)$/)) {

          //when does the crazy goose open
          //when will ...
          //do the avengers play (where | when is also implicit here)
          //when do the arctic monkeys perform
          //is the green lantarn open (!! SPECIAL CASE)
          commandObj.questionType = "Q_PASSIVE_IMPLICIT";

        } else if (chunks.abstractText.match(/^(chunk:NP( chunk:(VP|PP))+)$/)) {
          //all bands who|that|which play tonight (that have high ratings)
          //all bands playing tonight
          //jazz concerts tonight (no verb)
          //
          commandObj.questionType = "IMPERATIVE";

          //TODO: show me all bands playing tonight. -> chunk:NP chunk:NP chunk:VP
          //IS THIS SOMETHING WE CAN IMEPLEMENT GENERALLY?
          //PROBLEM HERE IS THAT IT'S DIFFICULT (IMPOSSIBLE FOR THE GENERAL CASE?) TO DECIDE WHAT THE 'OPERATING NOUN' IS.
          //THEREFORE PROBABLY BETTER TO MAKE SPECIAL CASES SUCH AS 'SHOW ME'
        }

        console.log(commandObj);

        switch (sentenceSignals.nounType) {
          case NOUN_TYPE.PLURAL:
            return processPlural(commandObj);

          case NOUN_TYPE.SINGULAR:
            return processSingular(commandObj);

          case NOUN_TYPE.PLURAL:
            return processFallback(commandObj);

          default:
            return processFallback(commandObj);

        }
      });
  }

  function getAllSubtypesMap() {
    // <subtype -> [root]>
    var subtypeToRoots = {};
    _.each(cacheUtils.supportedAttribsPerRoot, function (obj, root) {
      _.each(obj.subtypes, function (val) {
        subtypeToRoots[val] = subtypeToRoots[val] || [];
        subtypeToRoots[val].push(root);
      });
    });
    return subtypeToRoots;
  }


  function findNPSignals(nounSignals, np, subtypeToRoots) {

    var lastNounIndex = np.abstract.lastIndexOf("tag:NN");
    if (!~lastNounIndex) {
      //Sometimes a NP doesn't have a noun. 
      //Most of the time this is due to improper NP assignment.
      //Skip for now
      nounSignals.noNounFound = true;
      return;
    }

    //Multiple nouns found in NP. 
    //Most of the time this is due to improper NP assignment.
    //-> try to get proper noun in some controlled situations
    if (np.abstract.indexOf("tag:NN") !== lastNounIndex) {
      nounSignals.multipleNounsFound = true;

      var multipleNouns = chunkUtils.filter(np.parts, {
        tag: "NN"
      });

      //for debug: show the multiple nouns found
      nounSignals.multipleNouns = _.pluck(multipleNouns, "text");

      var subtypeMapArr = _.map(nounSignals.multipleNouns, function (noun) {
        //return true if noun matches at least 1 subtype, false otherwise
        return !!_.find(subtypeToRoots, function (roots, subtype) {
          return ~noun.indexOf(subtype);
        });
      });

      var subtypeMapPostiveArr = _.compact(subtypeMapArr);

      if (!subtypeMapPostiveArr.length) {

        //although multiple nouns found, no subtype was found
        nounSignals.multipleNounsNoSubtypeFound = true;
        return;

      } else if (subtypeMapPostiveArr.length > 1) {

        //Multiple nouns as well as subtypes found in NP
        //This should never happen?
        nounSignals.multipleNounsMultipleSubtypesFound = true;
        return;
      }

      return repairMultipleNouns(nounSignals, np, subtypeMapArr, multipleNouns, subtypeToRoots);
    }

    //PRE: there's exactly 1 noun

    //if true, NP consists of multiple parts
    nounSignals.isComplexNoun = np.abstract.length > 1;

    //Noun found at end of NP
    //weak signal for non-proper noun
    if (lastNounIndex === np.abstract.length - 1) {
      nounSignals.nounExistsAtEnd = true;
    }

    var noun = np.parts[lastNounIndex].text;

    //Match each of the defined subtypes (over all roots) as prefix-needle (edge N-gram)
    //against noun. 
    //
    //Multiple subtypes can match i.e.: place and placewithopeninghours.
    //In this case we match against the longest matching subtype.
    //
    //Moreover, a subtype may, theoretically, be defined against multiple roots
    var matchedSubtype = "";
    _.each(subtypeToRoots, function (roots, subtype) {
      if (~noun.indexOf(subtype) && subtype.length > matchedSubtype.length) {
        matchedSubtype = subtype;
      }
    });

    if (matchedSubtype) {

      //set subtypeMatched to the actual subtype matched. E.g.: "restaurant"
      nounSignals.subtypeMatched = matchedSubtype;

      //Detect plural naively: if noun ends with an 's' but subtype doesn't
      nounSignals.subtypePlural = noun.lastIndexOf("s") === noun.length - 1 && matchedSubtype.lastIndexOf("s") !== matchedSubtype.length - 1;

      //set the related roots for the matched subtype
      nounSignals.subtypeRoots = subtypeToRoots[matchedSubtype];
    }
  }


  function repairMultipleNouns(nounSignals, np, subtypeMapArr, multipleNouns, subtypeToRoots) {
    //PRE: although multiple nouns found, only 1 matched a subtype. 
    //Most likely this is caused by improper POS-tagging. 
    //e.g.: italian restaurant -> "tag:NN tag:NN"

    //Proceed as if single noun matched...

    for (var i = 0; i < subtypeMapArr.length; i++) {
      if (subtypeMapArr[i] === false) {
        var improperNounPart = multipleNouns[i];

        var newTag = "JJ"; //move to adjective. Semi-random choice
        improperNounPart.tag = newTag;
        improperNounPart.abstract = ["tag:" + newTag];
        improperNounPart.path = improperNounPart.path.replace(/(NN)/g, newTag);
      }
    }

    //fix the other data-structures
    np.abstract = [];
    np.path = "NP";
    _.each(np.parts, function (part) {
      np.abstract.push("tag:" + part.tag);
      np.path += " " + part.path;
    });
    np.abstractText = np.abstract.join(" ");

    //tag multiple nouns as repaired, but other than that continue as if single noun found
    nounSignals.multipleNounsRepaired = true;
    nounSignals.multipleNounsFound = false;

    //redo with single noun
    return findNPSignals(nounSignals, np, subtypeToRoots);
  }

  return {
    createQueryPlan: createQueryPlan
  };

};
