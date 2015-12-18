//A media episode (e.g. TV, radio, video game) which can be part of a series or season.
module.exports = {
	properties: {
		actor: {
			isMulti: true
		},
		director: {
			isMulti: true
		},
		episodeNumber: {},
		musicBy: {
			isMulti: true
		},
		partOfSeason: {},
		partOfSeries: {},
		productionCompany: {},
		trailer: {
			isMulti: true
		},
	}
};
