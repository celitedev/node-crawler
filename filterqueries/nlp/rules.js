var _ = require("lodash");

var ruleMapGeneral = {
  NUMBER_CHUNK: {
    ruleType: 'tokens',
    pattern: '[{ word:/one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen/}]',
    result: "CD"
  },

  NUMBER_CHUNK1: {
    ruleType: 'tokens',
    pattern: '[{ tag:CD}]',
    result: "CD"
  },
};

var ruleMapDate = {

  //january -> MONTH
  MONTH: {
    ruleType: 'tokens',
    pattern: '[{ word:/january|february|march|april|may|june|july|august|september|october|november|december/ }]',
    result: "MONTH"
  },

  //weekdays
  //sundays -> weekday
  WEEKDAY: {
    ruleType: 'tokens',
    pattern: '[{ word:/monday|tuesday|wednesday|thursday|friday|saturday|sunday(s)*/}]',
    result: "WEEKDAY"
  },

  //e.g.: afternoon
  TIMEOFDAY: {
    ruleType: "tokens",
    pattern: "[{word:/morning|afternoon|evening|night|midnight|midday/}]",
    result: "TIMEOFDAY"
  },

  TIMESPAN: {
    ruleType: 'tokens',
    pattern: '[{word:/day(s)*|week(s)*|month(s)*|year(s)*/}]',
    result: "TIMESPAN"
  },


  //E.g.: 3 weeks
  RELATIVE_DATE1: {
    ruleType: 'tokens',
    pattern: "[{chunk:CD}] [{chunk:TIMESPAN}]",
    result: "RELATIVE_DATE"
  },

  //E.g. next month / coming month
  //"the day" (later to be constructed in 'the day after tomorrow for instance')
  RELATIVE_DATE2: {
    ruleType: 'tokens',
    pattern: "[{ word:/the|this|next|coming|following|last|prior|previous/}] [{chunk:/TIMESPAN|RELATIVE_DATE/}]",
    result: "RELATIVE_DATE"
  },


  //month + day -> DATE
  //january 12 -> DATE
  DATE_FROM_MONTH: {
    ruleType: "tokens",
    pattern: "[{chunk:MONTH}] [{word:\\d{1,2}; chunk:CD}]",
    result: "DATE"
  },

  //Simple terms that directly indicate a date.
  //e.g.: yesterday -> DATE
  //now (as in 3 weeks from now) 
  DATE_FROM_DAY_DIRECTLY: {
    ruleType: 'tokens',
    pattern: '[{ word:/yesterday|today|tomorrow|now/}]',
    result: "DATE"
  },

  //date from weekday
  //this sunday -> DATE
  //next saturday -> DATE
  DATE_FROM_WEEKDAY: {
    ruleType: "tokens",
    pattern: "[{word:/this|next|coming|following|last|prior|previous/}] [{chunk:WEEKDAY}]",
    result: "DATE"
  },

  //Used to compose compound dates
  //(DATE | WEEKDAY) in RELATIVE_DATE -> DATE
  //e.g: tomorrow in 3 weeks
  DATE_FROM_RELATIVEDATE1: {
    ruleType: "tokens",
    pattern: "[{chunk:/DATE|WEEKDAY/}] [{word:in}] [{chunk:RELATIVE_DATE}]",
    result: "DATE"
  },

  //RELATIVE_DATE from (DATE | WEEKDAY) -> DATE
  //e.g. 3 weeks from tomorrow
  //16 days after tomorrow
  DATE_FROM_RELATIVEDATE2: {
    ruleType: "tokens",
    pattern: "[{chunk:RELATIVE_DATE}] [{word:/from|before|after|since/}] [{chunk:/DATE|WEEKDAY/}]",
    result: "DATE"
  },

  //3 weeks ago
  DATE_FROM_RELATIVEDATE3: {
    ruleType: "tokens",
    pattern: "[{chunk:RELATIVE_DATE}] [{word:/ago/}]",
    result: "DATE"
  },

  //in 3 weeks
  DATE_FROM_RELATIVEDATE4: {
    ruleType: "tokens",
    pattern: "[{word:/in/}] [{chunk:RELATIVE_DATE}]",
    result: "DATE"
  },

  //friday afternoon
  DATE_FROM_TIMEOFDAY: {
    ruleType: "tokens",
    pattern: "[{chunk:/DATE|WEEKDAY/}] [{chunk:TIMEOFDAY}]",
    result: "DATE"
  },

  //(the) afternoon of DATE
  DATE_FROM_TIMEOFDAY1: {
    ruleType: "tokens",
    pattern: "[{tag:DT}]* [{chunk:TIMEOFDAY}] [{word:/of/}]* [{chunk:/DATE|WEEKDAY/}] ",
    result: "DATE"
  },

  //last night, etc
  DATE_FROM_TIMEOFDAY2: {
    ruleType: "tokens",
    pattern: "[{word:/the|this|last|next|coming|following|last|prior|previous/}] [{chunk:TIMEOFDAY}]",
    result: "DATE"
  },


  //catchall for weekdays if not matched using more complex stuff
  WEEKDAY_TO_DATE: {
    ruleType: "tokens",
    pattern: "[{chunk:WEEKDAY}]",
    result: "DATE"
  },

  //this + date -> date
  THIS_DATE: {
    ruleType: "tokens",
    pattern: "[{word:/this/}] [{chunk:DATE}]",
    result: "DATE"
  },
};


var ruleMapDuration = {
  //When we don't match relativeDate to a DATE then it should be matched to a DURATION
  //e.g.: coming 3 weeks
  RELATIVE_DATE_TO_DURATION: {
    ruleType: "tokens",
    pattern: "[{chunk:RELATIVE_DATE}]",
    result: "DURATION"
  },
  THE_DURATION: {
    ruleType: "tokens",
    pattern: "[{word:/the/}] [{chunk:DATE_SPAN}]",
    result: "DURATION"
  },
  WEEKEND: {
    ruleType: "tokens",
    pattern: "[{word:/this|next|coming|following|last|prior|previous/}]* [{word:/weekend/}]",
    result: "DURATION"
  },
};


var pos = require('pos');
var chunker = require('pos-chunker');
var tagger = new pos.Tagger();

//Sometimes the simple pos-tagger makes a mistake.
//We correct the most occuring errors here.
var wordOverwriteMap = {
  open: "VB" //the word open should always be a VB (verb). Incorrectly identified as JJ (adverb)
};

var tagOverwriteMap = {
  "NNS": "NN" //problems with plural nouns
};


var ruleMapNP = {
  //e.g: the large black cat
  //KWHEN: often denoting: 
  // - Proper Noun (e.g.: name of bar)
  // - (sub)type + adjectives (e.g.: best italian restaurants)
  //   - all Delightfully cheap restaurants
  NP: {
    ruleType: 'tokens',

    //determiner + 
    //Adverb | Adverb, comparitive | Adverb, superlative
    //adjective | Adjective, comparative | Adjective, superlative
    //singular/plural (proper) noun
    pattern: '[ { tag:/DT|RB(R|S)*|JJ(R|S)*|NN.*?/ } ]+',
    // pattern: '[ { tag:/DT|JJ|NN.*?/ } ]+',
    // pattern: '[{tag:DT}]* [{tag:/RB(R|S)*/}]* [{tag:/NN.*?/}]',
    result: 'NP'
  },

  //possive pronouns:
  //'my house' | my favorite restaurant
  NP_POSSESSIVE: {
    ruleType: 'tokens',
    pattern: '[{tag:/PRP\\$|PRP/}] [{chunk:NP}]',
    result: 'NP'
  },


  //prepositional phrase is a noun phrase preceded by a preposition
  //e.g.: 'in the house' and 'by the cold pool' 
  //KWHEN: often denoting where / when
  PP: {
    ruleType: 'tokens',
    pattern: '[{tag:IN}] [{chunk:/NP|CLAUSE/}]',
    result: 'PP'
  },

  //e.g.: near me
  PP_TAG: {
    ruleType: 'tokens',
    pattern: '[{tag:IN}] [{tag:/PRP|PRP$|WP|WP$/}]', //NOTE TOO SURE: added all pronouns as found in peen treebank
    result: 'PP'
  },

  // verb phrase:  verb followed by one or more noun or prepositional phrases
  //e.g.: 'washed the dog in the bath'
  //KWHEN: play in the garden?
  VP: {
    ruleType: 'tokens',
    pattern: '[ { tag:/VB.*?/ } ] [ { chunk:/NP|PP/ } ]+',
    result: 'VP'
  },

  //COSTLY! the warm blanket -> 1500ms
  // //e.g.: (when does) miley cyrus play in the garden?
  // CLAUSE: {
  //   ruleType: 'tokens',
  //   pattern: '[ { chunk:NP}] [ { chunk:VP } ]',
  //   result: 'CLAUSE'
  // },


  ////////////////////////////////////////////////////////////
  // //THIS STUFF LEADS TO EXTREMELY HIGH PROCESSING COSTS. WHY? 
  // // //we may have tagged some numbers that were part of NP. 
  // // //We re-add these numbers to NP here, unless they are part of another bigger (temporal) structure
  // NP_WITH_NR: {
  //   ruleType: "tokens",
  //   pattern: '[ { chunk:CD } ] [ { chunk:NP }]',
  //   result: 'NP'
  // },
  // 
  // THIS ONE IN PARTICULAR. 
  // WE ALREADY TRIED IN SEVERAL OTHER WAYS
  // //combine two consequtive NPs (this only triggers if NP_WITH_NR triggered  )
  // NP_WITH_NRCOMBINE: {
  //   ruleType: "tokens",
  //   pattern: '[ { chunk:NP }] [ { chunk:NP }]',
  //   result: 'NP'
  // }
};

var NLPRules = module.exports = _.extend({}, ruleMapGeneral, ruleMapDate, ruleMapNP, ruleMapDuration);

NLPRules.getTags = function (question) {
  question = question.toLowerCase();

  var words = new pos.Lexer().lex(question);
  var taggedWords = tagger.tag(words);

  var tags = "";
  _.each(taggedWords, function (val) {
    var word = val[0];
    var tag = wordOverwriteMap[word] || tagOverwriteMap[val[1]] || val[1];
    tags += " " + word + "/" + tag;
  });
  tags = tags.trim();

  return tags;
};


NLPRules.getChunks = function (tags) {
  var chunks = chunker.chunk(tags, [
    NLPRules.NUMBER_CHUNK,
    NLPRules.NUMBER_CHUNK1,
  ]);

  //apply date-rules
  chunks = chunker.chunk(chunks, [
    NLPRules.MONTH,
    NLPRules.WEEKDAY,
    NLPRules.TIMEOFDAY,
    NLPRules.TIMESPAN,
    NLPRules.RELATIVE_DATE1,
    NLPRules.RELATIVE_DATE2,
    NLPRules.DATE_FROM_MONTH,
    NLPRules.DATE_FROM_DAY_DIRECTLY,
    NLPRules.DATE_FROM_WEEKDAY,
    NLPRules.DATE_FROM_RELATIVEDATE1,
    NLPRules.DATE_FROM_RELATIVEDATE2,
    NLPRules.DATE_FROM_RELATIVEDATE3,
    NLPRules.DATE_FROM_RELATIVEDATE4,
    NLPRules.DATE_FROM_TIMEOFDAY,
    NLPRules.DATE_FROM_TIMEOFDAY1,
    NLPRules.DATE_FROM_TIMEOFDAY2,
    NLPRules.WEEKDAY_TO_DATE,
    NLPRules.THIS_DATE,
  ]);

  //apply datespan rules
  chunks = chunker.chunk(chunks, [
    NLPRules.RELATIVE_DATE_TO_DURATION,
    NLPRules.THE_DURATION,
    NLPRules.WEEKEND,
  ]);

  //apply NP rules
  chunks = chunker.chunk(chunks, [
    NLPRules.NP,
    NLPRules.NP_POSSESSIVE,
    NLPRules.PP,
    NLPRules.PP_TAG,
    NLPRules.VP,
    NLPRules.CLAUSE
  ]);

  return chunks;
};



var doTest = true;
var hasErrors = false;
var showStats = false;


/////////////////////////////////////////////
//SEE: http://www.chompchomp.com/terms.htm //
/////////////////////////////////////////////

//TODO: 
//- add date / time
//- add spatial (wrapper around PP?)
//
//USAGE: 
var testPrepositionalPhrases = [{
  question: "on Statton Island",
  "chunks": "[PP on/IN [NP statton/NN island/NN]]"
}, {
  question: "in my house",
  "chunks": "[PP in/IN [NP my/PRP$ [NP house/NN]]]"
}, {
  question: "near my favorite restaurant",
  chunks: "[PP near/IN [NP my/PRP$ [NP favorite/JJ restaurant/NN]]]"
}, {
  "question": "at my favorite restaurant",
  "chunks": "[PP at/IN [NP my/PRP$ [NP favorite/JJ restaurant/NN]]]"
}];


//TODO: test VB (Verb Phrase)


//TODO: MORE END TO END EXAMPLES
var testE2E = [{
  question: "what restaurants are located near me",
  chunks: "what/WP [NP restaurants/NN] [VP are/VBP located/VBN [PP near/IN me/PRP]]"
}, {
  question: "what restaurants are located near the sutton hotel",
  chunks: "what/WP [NP restaurants/NN] [VP are/VBP located/VBN [PP near/IN [NP the/DT sutton/NN hotel/NN]]]"
}];

var testQuestions = []
  .concat(testPrepositionalPhrases)
  .concat(testE2E);

_.each(testQuestions, function (questionObj) {
  var chunks = NLPRules.getChunks(NLPRules.getTags(questionObj.question));

  if (doTest && chunks !== questionObj.chunks) {
    console.log("##################################");
    console.log("SHOULD", questionObj);
    console.log("WAS", chunks);
    hasErrors = true;
  }

  if (showStats) {
    console.log("##################################");
    console.log(questionObj);
  }

});
if (hasErrors) {
  throw new Errors("see above errors");
}
