module.exports = {
	//other props like address, addressCountry, etc removed
	//based on static analysis of topology (see #60)
	//Basically: Place is the only type that references valueObject GeoCoordinates. 
	//Since Place has a property PostalAddress which contains addres, addressCountry, etc. 
	//there's absolutely zero need to have these properties on GeoCoordinates
	properties: {
		elevation: {},
		latitude: {},
		longitude: {}
	},
	removeProperties: [
		"name", "url", "description", "alternateName", "sameAs"
	]
};
