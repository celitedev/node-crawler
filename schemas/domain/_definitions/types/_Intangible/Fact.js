module.exports = {
	supertypes: ["Intangible"],
	isValueObject: true,
	isCustom: true,
	properties: {
		val: true,
		name: true,
	},
	removeProperties: ["sameAs", "alternateName", "url", "description", "fact", "tag"]
};
