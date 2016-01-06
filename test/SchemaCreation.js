var assert = require('assert');
var _ = require("lodash");

var schemaConfig = require("./config/schema");

var generatedSchemas = require("../schemas/domain/createDomainSchemas.js")(_.extend({
	checkSoundness: false
}, schemaConfig));

var datatypes = generatedSchemas.datatypes;
var properties = generatedSchemas.properties;
var types = generatedSchemas.types;

describe('Datatypes', function() {
	describe('isDataType-property', function() {
		it('should be present and true on all datatypes', function() {
			assert.equal(_.filter(datatypes, {
				isDataType: true
			}).length, _.size(datatypes));
		});
	});
});


describe('Global Properties', function() {

	describe("domains-property", function() {
		it("has correct 'domains' attrib but only type if ancestor of type isn't included in domain", function() {
			assert.equal(_.eq(properties.name.domains, ["Thing"]), true);
			assert.equal(_.eq(properties.logo.domains, ["Organization", "Group"]), true);
		});

	});

	describe("required-directive", function() {
		it("results in correctly requiring property", function() {
			assert.equal(properties.nameRequired.required, true);
		});
	});

	//alias
	//...
});


describe('Types', function() {


	describe("Type with multiple supertypes", function() {
		it("has ancestors set in correct order", function() {

			//order is important here, since it allows us to find the lowest root
			assert.equal(types.LocalBusiness.ancestors.length, 3);
			assert(types.LocalBusiness.ancestors[0], "Thing");
			assert(types.LocalBusiness.ancestors[1], "Place");
			assert(types.LocalBusiness.ancestors[2], "Organization");
		});
	});

	describe("required-directive", function() {

		describe("setting required=true on type specific property", function() {

			assert.equal(properties.name.required, false);

			it("sets said type-specific property to true", function() {
				assert.equal(types.Thing.properties.name.required, true);
			});
			it("... as well as all subtypes of type", function() {
				assert.equal(types.Place.properties.nameB.required, true);
				assert.equal(types.LocalBusiness.properties.nameB.required, true);
			});
			it("works even if property was already defined on supertype", function() {
				assert.equal(types.Place.properties.nameC.required, true);
			});
		});

		describe("setting required=false on type specific property", function() {

			assert.equal(properties.name.required, false);
			assert.equal(types.Thing.properties.name.required, true);

			it("doesn't work if property already required upstream", function() {
				assert.notEqual(types.Place.properties.name.required, false);
			});
			it("... doesn't work on subType either", function() {
				assert.notEqual(types.LocalBusiness.properties.name.required, false);
			});
		});
	});

	describe("removeProperties-directive", function() {
		it("removes defined properties correctly", function() {
			assert.equal(!!types.LocalBusiness.properties.logo, false);
		});

		it("... unless it's a required property, whicih will result in a throw", function() {

			//we even throw in this case
			var objFaulty = _.cloneDeep(schemaConfig);
			objFaulty.types.LocalBusinessFaulty = {
				isCustom: true,
				supertypes: ["Place", "Organization"],
				removeProperties: ["logo", "logoRequired"]
			};

			assert.throws(function() {
				var schema = require("../schemas/domain/createDomainSchemas.js")(_.extend({
					checkSoundness: false
				}, objFaulty));
			});
		});
	});

	describe("a Place...", function() {
		it("is an entity", function() {
			assert.equal(types.Place.isEntity, true);
		});
		it("is a root", function() {
			assert.equal(types.Place.isRoot, true);
			assert.equal(types.Place.rootName, types.Place.id);
		});
		describe("is a root...", function() {
			it("therefore all decendants of Place are entities as well", function() {

				var allEntity = true;
				_.each(types, function(t) {
					if (t.ancestors.indexOf("Place") !== -1 && !t.isEntity) {
						allEntity = false;
					}
				});
				assert.equal(allEntity, true);
			});
		});
	});

	describe("a Restaurant...", function() {
		it("is an entity", function() {
			assert.equal(types.Restaurant.isEntity, true);
		});
		describe("is contained by two roots Place and LocalBusiness", function() {
			it("but rootName = LocalBusiness. i.e.: the 'smallest containing root'", function() {
				assert.equal(types.Restaurant.rootName, "LocalBusiness");
			});
		});
	});

	describe("All entities", function() {
		it("define a rootName", function() {
			var entities = _.filter(types, "isEntity");
			var entitiesWithRootName = _.filter(entities, "rootName");
			assert.equal(entities.length, entitiesWithRootName.length);
		});
	});
	describe("All non-entities", function() {
		it("don't define a rootName", function() {
			var nonEntities = _.filter(types, function(t) {
				return !t.isEntity;
			});
			var nonEntitiesWithRootName = _.filter(nonEntities, "rootName");

			assert.equal(nonEntities.length > 0, true);
			assert.equal(nonEntitiesWithRootName.length, 0);
		});
	});
});
