//CreativeWorkSeries dedicated to TV broadcast and associated online delivery.
module.exports = {
	properties: {
		actor: {
			isMulti: true
		},
		containsSeason: { //ref to CreativeWorkSeason 
			isMulti: true
		},
		countryOfOrigin: {},
		director: {
			isMulti: true
		},
		episode: {
			isMulti: true
		},
		musicBy: {
			isMulti: true
		},
		numberOfEpisodes: {},
		numberOfSeasons: {},
		productionCompany: {},
		trailer: {
			isMulti: true
		},
	}
};
