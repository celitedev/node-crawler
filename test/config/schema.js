var properties = {
  name: {
    isCustom: true,
    ranges: ["Text"]
  },
  nameRequired: {
    isCustom: true,
    ranges: ["Text"],
    required: true
  },
  nameB: {
    isCustom: true,
    ranges: ["Text"],
  },
  nameC: {
    isCustom: true,
    ranges: ["Text"],
  },
  logo: {
    isCustom: true,
    ranges: ["Text"],
    required: false
  },

  logoRequired: {
    isCustom: true,
    ranges: ["Text"],
    required: true
  },
};

var types = {
  Thing: {
    isCustom: true,
    isAbstract: true,
    properties: {
      name: true,
      nameRequired: false,
      nameB: true,
      nameC: false,
    },
    supertypes: [],
  },
  Place: {
    isCustom: true,
    supertypes: ["Thing"],
    properties: {
      //test this this does NOT work, since already required on super
      name: false,
      //test this works on property already defined on super
      nameC: true,
    },
  },

  Organization: {
    isCustom: true,
    supertypes: ["Thing"],
    properties: {
      logo: false,
      logoRequired: false
    },
  },

  LocalBusiness: {
    isCustom: true,
    supertypes: ["Place", "Organization"],
    removeProperties: ["logo"]
  },

  Restaurant: {
    isCustom: true,
    supertypes: ["LocalBusiness"],
  },

  Group: {
    isCustom: true,
    supertypes: ["Thing"],
    properties: {
      logo: false,
      logoRequired: false
    },
  },

};

var config = {
  domain: {
    roots: [
      "Place",
      "LocalBusiness"
    ]
  }
};

var schemaOrgDef = {
  datatypes: {
    "Boolean": {
      "ancestors": [
        "DataType"
      ],
      "comment": "Boolean: True or False.",
      "comment_plain": "Boolean: True or False.",
      "id": "Boolean",
      "label": "Boolean",
      "properties": [],
      "specific_properties": [],
      "subtypes": [],
      "supertypes": [],
      "url": "http://schema.org/Boolean"
    },
    "DataType": {
      "ancestors": [],
      "comment": "The basic data types such as Integers, Strings, etc.",
      "comment_plain": "The basic data types such as Integers, Strings, etc.",
      "id": "DataType",
      "label": "Data Type",
      "properties": [],
      "specific_properties": [],
      "subtypes": [],
      "supertypes": [],
      "url": "http://schema.org/DataType"
    },
    "Date": {
      "ancestors": [
        "DataType"
      ],
      "comment": "A date value in <a href=\"http://en.wikipedia.org/wiki/ISO_8601\">ISO 8601 date format</a>.",
      "comment_plain": "A date value in ISO 8601 date format.",
      "id": "Date",
      "label": "Date",
      "properties": [],
      "specific_properties": [],
      "subtypes": [],
      "supertypes": [],
      "url": "http://schema.org/Date"
    },
    "DateTime": {
      "ancestors": [
        "DataType"
      ],
      "comment": "A combination of date and time of day in the form [-]CCYY-MM-DDThh:mm:ss[Z|(+|-)hh:mm] (see Chapter 5.4 of ISO 8601).",
      "comment_plain": "A combination of date and time of day in the form [-]CCYY-MM-DDThh:mm:ss[Z|(+|-)hh:mm] (see Chapter 5.4 of ISO 8601).",
      "id": "DateTime",
      "label": "Date Time",
      "properties": [],
      "specific_properties": [],
      "subtypes": [],
      "supertypes": [],
      "url": "http://schema.org/DateTime"
    },
    "False": {
      "ancestors": [
        "DataType",
        "Boolean"
      ],
      "comment": "The boolean value false.",
      "comment_plain": "The boolean value false.",
      "id": "False",
      "label": "False",
      "properties": [],
      "specific_properties": [],
      "subtypes": [],
      "supertypes": [],
      "url": "http://schema.org/False"
    },
    "Float": {
      "ancestors": [
        "DataType",
        "Number"
      ],
      "comment": "Data type: Floating number.",
      "comment_plain": "Data type: Floating number.",
      "id": "Float",
      "label": "Float",
      "properties": [],
      "specific_properties": [],
      "subtypes": [],
      "supertypes": [],
      "url": "http://schema.org/Float"
    },
    "Integer": {
      "ancestors": [
        "DataType",
        "Number"
      ],
      "comment": "Data type: Integer.",
      "comment_plain": "Data type: Integer.",
      "id": "Integer",
      "label": "Integer",
      "properties": [],
      "specific_properties": [],
      "subtypes": [],
      "supertypes": [],
      "url": "http://schema.org/Integer"
    },
    "Number": {
      "ancestors": [
        "DataType"
      ],
      "comment": "Data type: Number.",
      "comment_plain": "Data type: Number.",
      "id": "Number",
      "label": "Number",
      "properties": [],
      "specific_properties": [],
      "subtypes": [],
      "supertypes": [],
      "url": "http://schema.org/Number"
    },
    "Text": {
      "ancestors": [
        "DataType"
      ],
      "comment": "Data type: Text.",
      "comment_plain": "Data type: Text.",
      "id": "Text",
      "label": "Text",
      "properties": [],
      "specific_properties": [],
      "subtypes": [],
      "supertypes": [],
      "url": "http://schema.org/Text"
    },
    "Time": {
      "ancestors": [
        "DataType"
      ],
      "comment": "A point in time recurring on multiple days in the form hh:mm:ss[Z|(+|-)hh:mm] (see <a href=\"http://www.w3.org/TR/xmlschema-2/#time\">XML schema for details</a>).",
      "comment_plain": "A point in time recurring on multiple days in the form hh:mm:ss[Z|(+|-)hh:mm] (see XML schema for details).",
      "id": "Time",
      "label": "Time",
      "properties": [],
      "specific_properties": [],
      "subtypes": [],
      "supertypes": [],
      "url": "http://schema.org/Time"
    },
    "True": {
      "ancestors": [
        "DataType",
        "Boolean"
      ],
      "comment": "The boolean value true.",
      "comment_plain": "The boolean value true.",
      "id": "True",
      "label": "True",
      "properties": [],
      "specific_properties": [],
      "subtypes": [],
      "supertypes": [],
      "url": "http://schema.org/True"
    },
    "URL": {
      "ancestors": [
        "DataType",
        "Text"
      ],
      "comment": "Data type: URL.",
      "comment_plain": "Data type: URL.",
      "id": "URL",
      "label": "URL",
      "properties": [],
      "specific_properties": [],
      "subtypes": [],
      "supertypes": [],
      "url": "http://schema.org/URL"
    }
  },
  properties: {},
  types: {}
};


module.exports = {
  config: config,
  schemaOrgDef: schemaOrgDef,
  types: types,
  properties: properties
};
