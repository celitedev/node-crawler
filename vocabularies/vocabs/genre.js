module.exports = {
	type: "static",
	sourceMappings: {

		//mappings from sourceEntity-values -> controlled values
		//It's logical to model these per Type since this is how crawlers are written
		Movie: {

			//Fandango
			"3d": "3d",
			"art house/foreign": ["art house", "foreign"],
			"action/adventure": ["action", "adventure"],
			"ANIMATED": "animation",
			"comedy": "comedy",
			"concert/special events": "concert",
			"documentary": "documentary",
			"drama": "drama",
			"family": "family",
			"horror": "horror",
			"imax": "imax",
			"music/performing arts": ["music"],
			"sci-fi/fantasy": ["scifi", "fantasy"],
			"suspense/thriller": ["suspense", "thriller"],
			"romance": "romance",
		}
	},
	//all values (independent of type) including their aliases and parents 
	vocabulary: {
		"3d": {
			values: "3d",
			parents: "animation"
		},
		action: "action",
		adventure: "adventure",
		animation: ["animated", "drawn", "animation"],
		"art house": "art house",
		comedy: ["comedy", "comedies", "humor"],
		concert: "concert",
		drama: "drama",
		documentary: "documentary",
		family: ["family", "with kids"],
		fantasy: ["fantasy"],
		foreign: ["foreign", "abroad", "overseas"],
		horror: ["horror", "scary"],
		imax: "imax",
		music: {
			values: "music",
			parents: "performing arts"
		},
		romance: ["romance", "romcom", "romantic"],
		"performing arts": ["performing arts"],
		scifi: ["scifi", "sci-fi", "science fiction"],
		suspense: ["suspense", "thriller"],
		thriller: ["suspense", "thriller"],
	}
};
