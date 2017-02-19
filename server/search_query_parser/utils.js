const _ = require("lodash");

function parsedQuestionHasData( parsedQuestion ){
  return parsedQuestion
    && parsedQuestion.questions
    && parsedQuestion.questions.length > 0
}

function getEntityMentions( type, parsedQuestion ){
  if ( parsedQuestionHasData(parsedQuestion)
    && parsedQuestion.questions[0].specific_pattern_mentions )
  {
    const filteredMentions =  _.filter(parsedQuestion.questions[0].specific_pattern_mentions.reverse(), (mention) => {
      if (mention.type != type) return false;
      const mentionWithoutType = mention.text.replace(getTypeFilterText(parsedQuestion), '');
      return mentionWithoutType != '';
    });
    if (filteredMentions.length > 0) return filteredMentions[0].text.replace(getTypeFilterText(parsedQuestion), '');
  }
}

function getTypeFilterText( parsedQuestion ){
  if ( parsedQuestionHasData(parsedQuestion)
    && parsedQuestion.questions[0].generic_pattern_mentions
    && parsedQuestion.questions[0].generic_pattern_mentions.length > 0 )
  {
    return parsedQuestion.questions[0].generic_pattern_mentions[parsedQuestion.questions[0].generic_pattern_mentions.length-1].text;
  }
}

// EXPORTED //

function getDateFilter( parsedQuestion ){
  if ( parsedQuestionHasData(parsedQuestion)
    && parsedQuestion.questions[0].temporal_query_info
    && parsedQuestion.questions[0].temporal_query_info.length > 0 )
  {
    return parsedQuestion.questions[0].temporal_query_info[0];
  }
}

function getTypeFilter( parsedQuestion ){
  if ( parsedQuestionHasData(parsedQuestion)
    && parsedQuestion.questions[0].generic_pattern_mentions
    && parsedQuestion.questions[0].generic_pattern_mentions.length > 0 )
  {
    return parsedQuestion.questions[0].generic_pattern_mentions[parsedQuestion.questions[0].generic_pattern_mentions.length-1].type;
  }
}

function getOrganizationAndPersonFilter( parsedQuestion ){
  return getEntityMentions('OrganizationAndPerson', parsedQuestion);
}

function getPlaceWithOpeningHoursFilter( parsedQuestion ){
  let pwohMention = getEntityMentions('PlaceWithOpeninghours', parsedQuestion);
  let locationMention = getLocationFilter(parsedQuestion)
  if (pwohMention != locationMention) return pwohMention;
}

function getLocationFilter( parsedQuestion ){
  return getEntityMentions('LOCATION', parsedQuestion);
}

function getFilteredKeyword( parsedQuestion, type = null ){
  if ( parsedQuestionHasData(parsedQuestion) ) {
    let keyword = getDateFilter(parsedQuestion) ? parsedQuestion.questions[0].timeless_text.slice(0,-1) : parsedQuestion.questions[0].text.slice(0,-1);
    if (type && getEntityMentions(type, parsedQuestion)) {
      keyword = keyword.replace(getEntityMentions(type, parsedQuestion), '').slice(0,-1);
    }
    return keyword;
  } else {
    return parsedQuestion.questions[0].text.slice(0,-1); //TODO JIM HACK TO FIX SEARCH QUERY PARSER ISSUE #6
  }
}

function getFilteredKeywordWithoutType( parsedQuestion, type = null ){
  if ( getFilteredKeyword(parsedQuestion, type) ){
    return getFilteredKeyword(parsedQuestion, type).replace(getTypeFilterText(parsedQuestion), '').trim();
  } else {
    return "";
  }
}

function getRawKeyword( parsedQuestion ){
  if( parsedQuestionHasData(parsedQuestion) ){
    return parsedQuestion.questions[0].timeless_text.slice(0,-1); //TODO JIM HACK TO FIX SEARCH QUERY PARSER ISSUE #6
  }
}

function getRawKeywordWithoutType( parsedQuestion ){
  if( getRawKeyword(parsedQuestion) ) {
    return getRawKeyword(parsedQuestion).replace(getTypeFilterText(parsedQuestion), '').trim();
  } else {
    return "";
  }
}

module.exports = {
  getDateFilter: getDateFilter,
  getTypeFilter: getTypeFilter,
  getOrganizationAndPersonFilter: getOrganizationAndPersonFilter,
  getPlaceWithOpeningHoursFilter: getPlaceWithOpeningHoursFilter,
  getLocationFilter: getLocationFilter,
  getFilteredKeyword: getFilteredKeyword,
  getFilteredKeywordWithoutType: getFilteredKeywordWithoutType,
  getRawKeyword: getRawKeyword,
  getRawKeywordWithoutType: getRawKeywordWithoutType
};