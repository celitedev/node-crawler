var _ = require("lodash");
var Promise = require("bluebird");

var NLPRules = require("./rules");
var chunkUtils = require("./utils");

module.exports = function (command) {

  var cacheUtils = command.cacheUtils;

  function createQueryPlan(question) {

    var err;
    return Promise.resolve()
      .then(function () {

        var tags = NLPRules.getTags(question);
        var sChunk = NLPRules.getChunks(tags);

        var currentChunk = {
          type: "top"
        };

        var chunks = chunkUtils.getParts(currentChunk, sChunk);

        var questionType = "UNKNOWN";

        ///////////////////////////////////////////////////////////////
        //NOTE: THERE'S A PATTERN IN HOW EXPLICIT AND IMPLICIT DIFFER
        /////////////////////////////////////////////////////////////////

        if (chunks.abstractText.match(/^tag:WDT chunk:NP( chunk:VP)+( chunk:PP)*$/)) {
          //which restaurants are open tonight
          //which restaurants will be open tonight
          //which artist plays tonight in madison square garden
          //which jazz bands play tonight at my favorite club
          //which fine italian restaurants allow for reservations tomorrow night near grand central station
          //which events does arctic monkeys perform tonight at my favorite club 
          //which events does arctic monkeys perform tonight that are still available
          //which restaurants are fine to go to tonight
          questionType = "Q_ACTIVE_EXPLICIT";


          //- find NP
          //- decide on proper noun or not  (probably using couple of signals + confidence score in the end)
          //- plural / singular
          var np = chunkUtils.find(chunks.parts, {
            chunkType: "NP"
          });

          //TODO: other signals: 
          //- check for 'the' -> signal for proper noun
          //- check for plural -> signal for non-proper noun


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



          //////////////
          //based on various signals determine: 
          //1. Proper noun
          //2. noun plural 
          //   - with | without constraints
          //3. noun singlular
          //   - with  | without constraints




          // if (subtypeArr.length === 1) {
          //   var subtypeObj = subtypeArr[0];


          //   if (noun === subtypeObj.subtype) {
          //     //noun = subtype -> no adjectives, etc.

          //     console.log("simple noun", noun, subtypeObj);

          //   } else {
          //     console.log("complex non-proper noun? ", noun, subtypeArr);
          //   }
          // } else if (subtypeArr.length > 1) {

          // }

          // if (subtypeArr.length) {

          //   if (subtypeArr.length === 1) {

          //   } else {
          //     console.log("multiple subtypes found", noun, subtypeArr);
          //   }
          // } else {
          //   //no subtypes matched. 
          //   //stronish signal we're looking at proper noun
          //   console.log("no subtypes found. Proper noun? ", noun);
          // }




          //STEP 2
          //decide on sentence form, starting with 'who, which, when, where', etc. 
          //decide on missing context / defaulting. I.e.: for Q_ACTIVE_IMPLICIT | Q_PASSIVE_EXPLICIT
          //add defaults as PP

          //STEP 3
          //use VP and PP as filters

          //STEP 4. 
          //voila a filterContext.


        } else if (chunks.abstractText.match(/^tag:WDT chunk:NP( chunk:VP)*( tag:(VB.*?|MD))* (tag:VB.*?)$/)) {

          //which restaurants are|will open
          //which artist will play
          //which events does arctic monkeys perform
          questionType = "Q_ACTIVE_IMPLICIT";

        } else if (chunks.abstractText.match(/^(chunk:QUESTION chunk:VP chunk:VP)( chunk:PP)*$/)) {

          //when does|will the crazy goose open tonight in bla
          //do the avengers play tomorrow in the AMC at 6 pm

          //when do the arctic monkeys perform tonight
          questionType = "Q_PASSIVE_EXPLICIT";

        } else if (chunks.abstractText.match(/^(chunk:QUESTION chunk:VP( tag:(VB.*?|MD))* tag:VB.*?)$/)) {

          //when does the crazy goose open
          //do the avengers play (where | when is also implicit here)
          //when do the arctic monkeys perform
          //is the green lantarn open (!! SPECIAL CASE)
          questionType = "Q_PASSIVE_IMPLICIT";

        } else if (chunks.abstractText.match(/^(chunk:NP( chunk:(VP|PP))+)$/)) {
          //all bands who|that|which play tonight (that have high ratings)
          //all bands playing tonight
          //jazz concerts tonight (no verb)
          //
          questionType = "IMPERATIVE";

          //TODO: show me all bands playing tonight. -> chunk:NP chunk:NP chunk:VP
          //IS THIS SOMETHING WE CAN IMEPLEMENT GENERALLY?
          //PROBLEM HERE IS THAT IT'S DIFFICULT (IMPOSSIBLE FOR THE GENERAL CASE?) TO DECIDE WHAT THE 'OPERATING NOUN' IS.
          //THEREFORE PROBABLY BETTER TO MAKE SPECIAL CASES SUCH AS 'SHOW ME'
        }

        return {
          questionType: questionType,
          tags: tags,
          chunks: sChunk,
          tree: chunks,
        };
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
