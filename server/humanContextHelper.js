function keywordTemplate( label, keyword ) {
  return {
    templateData: {
      label: label,
      keyword: keyword
    },
    template: "<span class='accentColor'>{{nrOfResults}} <i>'{{keyword}}'</i>&nbsp;{{label.pluralOrSingular}}</span> {{label.sorted}}"
  };
}

function typeTemplate( label ){
  return {
    templateData: {
      label: label,
    },
    template: "<span class='accentColor'>{{nrOfResults}} {{label.pluralOrSingular}}</span> {{label.sorted}}"
  };
}

module.exports = {
  keywordTemplate: keywordTemplate,
  typeTemplate: typeTemplate
}